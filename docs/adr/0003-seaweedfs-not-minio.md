# 0003. SeaweedFS for object storage, not MinIO

Status: accepted

## Context

Need a self-hostable, S3-API-compatible object store for media/files (REQUIREMENTS.md §7.6).
MinIO is the default choice most people reach for, but its free Docker-image distribution terms
changed in 2025 in a way that made its long-term suitability for a project meant to be
freely self-hostable uncertain at decision time.

## Decision

SeaweedFS (`chrislusf/seaweedfs`), run as `weed server -s3`, talked to over the S3 API via the
AWS SDK — see `docker/seaweedfs/entrypoint.sh` and `StorageService`.

## Alternatives considered

- **MinIO** — most familiar, best-documented, but the licensing/distribution risk above; also
  the heavier of the options for a single-node self-host.
- **Garage** — AGPL, purpose-built for self-hosting, but bucket/key setup goes through its own
  CLI rather than being expressible as plain S3 calls, adding setup friction for the
  `s3-init` step this project wants to keep trivial.

## Consequences

Because the app talks to storage only through the S3 API (`@aws-sdk/client-s3`,
`StorageService`), swapping SeaweedFS for MinIO, Garage, AWS S3, or Cloudflare R2 later is a
config change (`S3_ENDPOINT`/`S3_PUBLIC_URL`/credentials), not a code change. Re-check
SeaweedFS's status before a real production deploy — this ADR's premise (MinIO's terms) is a
point-in-time judgment call, not a permanent one.
