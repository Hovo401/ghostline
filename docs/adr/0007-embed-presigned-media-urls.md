# 0007. Embed a fresh presigned URL in `Attachment`/`Message`, not a `GET /media/:id` redirect

Status: accepted

## Context

REQUIREMENTS.md §7.6 step 5 originally specified `GET /media/:id` → access check → redirect to a
short-lived presigned S3 URL, mirroring the same "backend never proxies file bytes" principle
used for uploads. Implementing the media attachment pipeline (T-032/F4) surfaced a problem with
that shape: the redirect target still has to be fetched by the browser, and the *initiating*
request for a protected resource embedded directly in HTML — `<img src>`, `<audio src>`,
`<video src>` — cannot carry an `Authorization: Bearer <token>` header. This app has no cookie
session (access tokens live in memory/localStorage, per the JWT-based auth design), so
`GET /media/:id` would have had to accept the token some other way (a query-string token, a
short-lived per-resource cookie) just to authenticate the redirect itself — more moving parts
than the thing it protects.

## Decision

`AttachmentSchema` carries a `url` field — a presigned S3 GET URL computed at read time via
`StorageService.createDownloadUrl`, on every response that includes an attachment. It is never
persisted (only `key` is stored); a fresh one is signed each time `toWireAttachment` runs.
`MessageSchema` gets a nullable `attachment` field so `GET /messages`, `POST /messages`, and the
`message:new`/`message:updated` WS pushes all carry the recipient's attachment (mime, name,
size, dimensions, URL) inline, without a second authenticated round trip to fetch it separately.

The backend route access check REQUIREMENTS.md's step 5 was protecting (only chat members can
see a chat's attachments) still happens — it's just enforced at the point the *message* is
authorized (`GET /messages`'s existing `assertMember`, `POST /messages`'s existing membership
check) rather than at a dedicated per-attachment endpoint.

## Alternatives considered

- **`GET /media/:id` with a token in the query string** — works with plain `<img>` tags, but
  leaks the token into server access logs, browser history and `Referer` headers; scoping a
  separate short-lived media-access token per attachment to avoid that is real complexity for
  no behavioral gain over embedding the URL directly.
- **A short-lived cookie set by a prior authenticated request** — needs a cookie-issuing
  endpoint and CORS/`SameSite` tuning; more infrastructure than a single-domain-behind-nginx
  deployment (docs/adr/0005-nginx-not-caddy.md) needs.

## Consequences

Attachment URLs expire (`PRESIGN_DOWNLOAD_TTL_SECONDS` in `StorageService`, currently 10 min) —
a client holding a stale `Message` object (e.g. from a long-open tab) needs to re-fetch the
message to get a fresh URL rather than retrying the same one; `GET /messages` already exists for
catch-up (`afterSeq`/`beforeSeq`) so this doesn't need new plumbing. There is no
`GET /media/:id` endpoint — a client can't deep-link to a bare attachment without first loading
the message it belongs to, which matches how the frontend's conversation view actually consumes
media (REQUIREMENTS.md §7.6's step 5 numbering is superseded by this ADR).

Presigned URLs (both the upload `PUT` this ADR doesn't otherwise touch, and the download `GET`
it's about) turned out to have two more sharp edges once tested against real SeaweedFS rather
than a mocked S3 client, both now fixed but worth naming so nobody reintroduces them:

- **The AWS SDK v3 signs a checksum against a body it hasn't seen yet.** `getSignedUrl` on a
  `PutObjectCommand` bakes an `x-amz-checksum-crc32`/`x-amz-sdk-checksum-algorithm` into the
  signed query string by default (SDK v3's flexible-checksum middleware), computed against an
  *empty* body since the real one isn't known at presign time. The browser then PUTs the actual
  file straight to that URL and SeaweedFS validates the checksum against the real body —
  mismatch, 403, every time. Fixed by setting `requestChecksumCalculation: "WHEN_REQUIRED"` on
  `StorageService`'s presign-only `S3Client` (`PutObjectCommand`/`GetObjectCommand` don't require
  one, so this leaves it off presigned requests entirely).
- **A reverse proxy must never rewrite the path between "what the SDK signed" and "what the
  storage backend receives."** SigV4 signs the request path as part of the signature; a
  `/s3/`-prefix-then-rewrite in front of SeaweedFS (the initial dev/prod nginx setup) made the
  signed path (`/s3/<key>`) disagree with the path SeaweedFS actually saw (`/<key>`) —
  `SignatureDoesNotMatch`, every time. Fixed by giving `S3_PUBLIC_URL` its own nginx port with a
  1:1 proxy and no rewrite instead of a shared-port path prefix — see
  docs/adr/0008-s3-public-url-needs-its-own-port.md for the full writeup.
