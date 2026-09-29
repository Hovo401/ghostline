# 0012. Multipart uploads above 16 MiB, completed server-side via `ListParts`

Status: accepted

## Context

FR-MEDIA-04's file size limit was raised to 1 GiB (from 100 MB). A single presigned `PUT` for a
1 GiB body is unreliable in practice: one dropped connection loses the whole upload, there's no
way to resume, and some intermediaries (and browsers) are unhappy streaming a multi-hundred-MB
request body in one shot. S3-compatible multipart upload (`CreateMultipartUpload` /
`UploadPart` / `CompleteMultipartUpload`) exists exactly for this, but it shifts a question onto
whoever calls `CompleteMultipartUpload`: which parts, with which `ETag`s, actually landed?

The obvious approach — have the browser report back the `ETag` each `UploadPart` response
returned, and pass that list to `complete` — needs the browser's `fetch`/`XHR` to read the
`ETag` response header off a cross-origin (browser → SeaweedFS on its own `S3_PUBLIC_URL` port,
docs/adr/0008) presigned `PUT`. That only works if S3's CORS config sets
`ExposeHeaders: ["ETag"]` on the bucket — one more piece of infrastructure to configure and keep
in sync between dev/prod, and one more thing a client could lie about (a malicious or buggy
client claiming a part uploaded that didn't, or claiming the wrong ETag).

A second, related question: how long should a presigned part URL live? A 1 GiB upload at modest
bandwidth can take many minutes; issuing all part URLs up front against a single presign TTL
(`PRESIGN_UPLOAD_TTL_SECONDS`, 15 min, docs/adr/0007) risks the last few parts' URLs expiring
before the client gets to them.

## Decision

- `POST /attachments/presign` returns `{ mode: "single", uploadUrl }` for files at or under
  `MULTIPART_THRESHOLD_BYTES` (16 MiB, `packages/contracts`) — unchanged single-`PUT` behavior —
  or `{ mode: "multipart", partSize, partCount }` above it, having already called
  `CreateMultipartUpload` server-side and stored the returned `uploadId` on the `Attachment` row.
- Part URLs are issued on demand, not all at once: `POST /attachments/:id/parts { partNumbers }`
  (up to 20 per call) presigns just the requested parts, each with its own fresh 15-minute TTL.
  The client asks for the next batch of parts as it's ready to upload them, so a slow, long-running
  upload never needs a part URL requested near the beginning to still be valid near the end.
- `POST /attachments/:id/complete` resolves the actual uploaded parts **server-side**: it calls
  `ListParts` against S3 (using the backend's own internal client, not the presign client) to get
  the authoritative list of `{ PartNumber, ETag }` pairs that exist in the bucket, sorts them, and
  passes that straight to `CompleteMultipartUpload`. The browser's presigned `UploadPart` responses
  are never read for their `ETag`. This needs no S3 CORS `ExposeHeaders` configuration at all, and
  a client can't complete an upload with parts it didn't actually put in the bucket.
- Either upload mode's `complete` step additionally verifies `HeadObject`'s `ContentLength` against
  the `size` declared at `presign` time, rejecting a mismatch with 400 — catches a lying client or
  a multipart upload that completed with the wrong parts.
- `DELETE /attachments/:id` cancels a still-`PENDING` upload: aborts the multipart upload in S3
  (`AbortMultipartUpload`) if one is in progress, best-effort deletes the object, and drops the row.

This is a follow-up to docs/adr/0007-embed-presigned-media-urls.md, which established
presigned-URL-embedded-in-the-response as the pattern for both upload and download. `GET
/attachments/:id` extends that: 0007's URLs live in `Message.attachment.url` and expire after
`PRESIGN_DOWNLOAD_TTL_SECONDS` (~10 min); a client that wants to download or preview an
attachment from a message older than that (or from an upload/message it doesn't currently have in
memory) calls `GET /attachments/:id` to get a fresh one. Access follows the same rule 0007
applies via the owning message's membership check: allowed for the attachment's uploader, or any
user who's a member of a chat containing a message that references this attachment.

## Alternatives considered

- **Trust browser-reported ETags for `CompleteMultipartUpload`.** Needs S3 CORS `ExposeHeaders`
  on every environment (dev, prod, codespaces), and trusts the client's account of what it
  uploaded instead of asking the storage backend. `ListParts` is one extra internal-client call
  we already have the credentials for; simpler to reason about and nothing to misconfigure.
- **Issue all part URLs up front at `presign` time.** Simpler (one round trip), but a 1 GiB
  upload can run well past a single presign TTL; parts near the end of a slow upload would get
  URLs that already expired. Requesting parts in batches as needed avoids tuning one TTL for
  every possible upload duration.
- **Raise `PRESIGN_UPLOAD_TTL_SECONDS` instead of issuing parts on demand.** Trades one problem
  for a worse one — a single very long-lived signed URL is a bigger leak risk if it ends up
  logged or cached anywhere, for no benefit over asking for more parts when needed.

## Consequences

Completing a multipart upload costs one extra S3 round trip (`ListParts`) the single-`PUT` path
doesn't pay, but that's negligible next to the upload itself. `Attachment.uploadId` is `null` for
single-`PUT` uploads and for every attachment created before this change; `completeUpload` and
`cancelUpload` branch on its presence to decide whether there's a multipart upload to finish or
abort. Abandoned multipart uploads (never completed or cancelled) still accumulate incomplete
parts in S3 storage — cleaning those up, along with any other `PENDING` attachment stuck longer
than a day, is REQUIREMENTS.md §7.6 step 7's still-unimplemented worker job, not solved here.
