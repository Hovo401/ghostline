# 0008. `S3_PUBLIC_URL` gets its own nginx port, not a shared-port path prefix

Status: accepted

## Context

The original dev/prod nginx configs exposed SeaweedFS's S3 API at `/s3/` on the same port as
the app (`:80` dev, `:443` prod), rewriting the prefix away before proxying
(`rewrite ^/s3/(.*)$ /$1 break;`) so SeaweedFS would see the same path a direct client would.
`StorageService`'s presign client was configured with `S3_PUBLIC_URL` pointed at that prefixed
URL (`http://localhost/s3`, `https://${DOMAIN}/s3`), per docs/adr/0007's decision to embed
presigned URLs directly in API responses.

This broke every real presigned request. SigV4 (the signing scheme `getSignedUrl` uses) signs
the request *path* as part of the canonical request — a presigned URL for key `<id>/file.png`
signed against `S3_PUBLIC_URL=http://localhost/s3` has `/s3/<id>/file.png` baked into its
signature. nginx's rewrite then strips `/s3` before SeaweedFS ever sees the request, so
SeaweedFS validates the signature against `/<id>/file.png` — a path that was never signed.
Every presigned PUT and GET failed with `SignatureDoesNotMatch`, 100% of the time, for every
attachment kind. (This is a separate, deeper bug than the one docs/adr/0007 anticipated: fixing
`requestChecksumCalculation` on the presign client — see that ADR's implementation — cleared a
prior `403` from an unwanted checksum header, but this path-prefix mismatch was still there
underneath, causing the same symptom with a different error code.)

A path rewrite is fundamentally incompatible with presigned URLs: the whole point of SigV4 is
that the signature covers exactly the path (and, per `X-Amz-SignedHeaders`, at minimum the
`Host` header) the storage backend will receive. Any reverse proxy sitting between "the host the
SDK signs against" and "the host the storage backend answers on" must forward both unchanged.

That second part bit again even after moving to a dedicated port with no rewrite: nginx's
`$host` variable strips the port from the incoming request's `Host` header (falling back to
`server_name` if absent), so `proxy_set_header Host $host;` forwarded `Host: localhost` to
SeaweedFS while the SDK had signed `Host: localhost:8333` (the non-default port is part of what
gets signed) — `SignatureDoesNotMatch` again, same symptom, this time from the one signed header
instead of the path. `$http_host` (the raw incoming `Host` header, port included) is the correct
variable for any proxy in front of a service that validates signed requests.

## Decision

SeaweedFS's S3 API gets a dedicated nginx port — `:8333` in both dev (`docker/nginx/dev.conf`)
and prod (`docker/nginx/prod.conf.template`) — proxied 1:1 with no path rewrite, no shared
prefix, and `proxy_set_header Host $http_host;` (not `$host`) so the signed port survives the
proxy too. `S3_PUBLIC_URL` points straight at that port (`http://localhost:8333` dev,
`https://${DOMAIN}:8333` prod) with no path suffix. `compose.dev.yaml`/`compose.prod.yaml`
publish `8333` on the `nginx` service alongside `80`/`443`.

## Alternatives considered

- **Keep the path prefix, sign against the origin-server path instead** — i.e. configure the
  presign client's endpoint as `http://seaweedfs:8333` (matching what SeaweedFS actually
  receives) but somehow still hand the browser a `/s3`-prefixed URL. Not achievable with
  `getSignedUrl`: the URL it returns *is* the signed request, host, path and all — there's no
  way to sign one path and serve a URL with a different one without breaking the signature.
- **A rewrite that preserves the full path in the signature by signing against the *external*
  path SeaweedFS is configured to expect** — would require SeaweedFS itself to know about and
  strip a `/s3` prefix (e.g. via its own path-style bucket routing), which its S3 gateway
  doesn't support as a configurable base path.
- **Keep everything on `:80`/`:443` using a subdomain instead of a path prefix** (e.g.
  `s3.${DOMAIN}`) — works for the same reason a dedicated port does (no path rewrite), but costs
  a DNS record and a second TLS SAN per deploy; a port is simpler for a single-host self-hosted
  stack that already publishes multiple ports (see docs/adr/0003).

## Consequences

One more port to open in any firewall/security-group config in front of the prod host (`8333`,
TLS-terminated by the same nginx/cert as `443`). `.env`'s `S3_PUBLIC_URL` needs the same manual
fix as the `.env` port issue noted in `docs/tasks/PROGRESS.md`'s F0 entry — `.env` is
`.gitignore`d and this tool can't edit it, so an existing `.env` from before this change must be
updated by hand (`http://localhost/s3` → `http://localhost:8333` dev, drop the `/s3` suffix and
add `:8333` in prod). Any future `S3_PUBLIC_URL` must never grow a path suffix again — a
dedicated port (or subdomain) per docs/adr/0003's storage-swap consequence is the only shape
that keeps a signed presigned URL valid all the way through a reverse proxy.
