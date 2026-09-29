# 0013. Cache media client-side by attachment id; auto-download only what's worth it

Status: accepted

## Context

Opening a chat with a lot of media, especially on a slow link, froze the feed: every `<img>`
fetched its full original, every `<video preload="metadata">` made range requests, and every
round video note (no `preload`, so effectively `auto`) could download in full, all at once.
Worse, nothing was ever cached. `attachment.url` is a freshly signed presigned URL on every
response (docs/adr/0007), so the browser's HTTP cache, which is keyed by URL, missed every time.

## Decision

- **Cache by id, not URL.** `entities/attachment/media-cache.ts` stores bytes in Cache Storage
  under `https://media.local/<attachmentId>`, bounded to 300 MB with an LRU index in localStorage.
  Only images ≤ 20 MB and audio/video ≤ 5 MB are kept. Your own uploads are written there right
  away.
- **One bounded queue.** `media-loader.ts`: at most 3 concurrent downloads, "high" priority
  (tap, fresh message) ahead of "low" (visible history), de-duplicated per attachment. A
  queued low-priority request is dropped when it scrolls away. A 403 means the URL expired, so it
  gets refreshed through `GET /attachments/:id` and retried once.
- **Auto-download policy** (`auto-download-policy.ts`): new messages that arrive over the socket
  download on their own (photos ≤ 10 MB, voice/video notes ≤ 5 MB), as do history photos ≤ 1 MB
  that come on screen. On Save-Data or 2g, only new messages do. Everything else shows a plate
  with a "↓ size" button. A picked video never downloads in the feed; the viewer streams it.
  Voice and video notes use `preload="none"` unless cached.

## Alternatives considered

- **Deterministic presigned URLs (time-bucketed signing date) + HTTP cache** fixes caching, but
  we still couldn't ask "is this cached?" to decide between a button and the image, and it
  doesn't bound concurrency.
- **Server-side thumbnails/thumbhash (FR-MEDIA-08)** would give nicer placeholders. That needs a
  schema, contract and worker change, so it's deferred. The plate is a themed backdrop for now.

## Consequences

Revisiting a chat costs no network for cached media, and a slow link only ever carries 3
downloads. Large history photos need one tap. Cache Storage is per-origin and missing in
private/http contexts, where everything degrades to "not cached".
