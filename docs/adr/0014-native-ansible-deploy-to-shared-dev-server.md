# 0014. Deploy the dev server natively with Ansible, reusing its Postgres and MinIO

Status: accepted

## Context

The shared dev server (`diotek.pp.ua`, 561 MiB RAM + 2 GiB swap) already runs
PostgreSQL 18, MinIO, nginx.org + certbot, Node 24 + pm2, n8n and two other
apps — all provisioned natively by the separate `homelab-infra` Ansible
project. Running `compose.prod.yaml` there would start a second Postgres and a
second S3 (SeaweedFS) next to the existing ones, which the box has no memory
for, and would fight the host nginx for ports 80/443.

## Decision

`deploy/` provisions only what Ghostline adds to that host — its own database
and role in the existing Postgres, its own private bucket and scoped user in
the existing MinIO, a dedicated Redis instance on `127.0.0.1:6380`, a
`conf.d` nginx vhost for `ghostline.diotek.pp.ua`, and a pm2 app pair
(backend + worker). A GitHub Actions workflow builds on push to `main` and
ships the release over rsync; the server never builds.

Presigned media URLs point at the existing `minio.diotek.pp.ua` vhost, which
proxies MinIO at its root with no path rewrite, so ADR 0008's constraint holds.

## Alternatives considered

- **`compose.prod.yaml` on the same host** — duplicates Postgres/S3 and needs
  ports 80/443 that the host nginx already owns.
- **Creating the DB/bucket from `homelab-infra`** — its `postgresql` role
  manages exactly one app database, so it would need generalizing; keeping
  Ghostline's additions in this repo lets one playbook run set everything up,
  and every change is additive (named `ghostline*`), never touching another
  app's objects.
- **Building on the server** — the build needs 1–2 GB RAM.

## Consequences

- Two deploy paths exist: `compose.prod.yaml` (self-hosting, the product's
  documented path) and `deploy/` (this one server). Changes to runtime env vars
  must be mirrored in `deploy/roles/app/templates/env.j2`.
- Uploads depend on `minio.diotek.pp.ua` staying reachable from browsers —
  narrowing `homelab-infra`'s `admin_allowed_cidrs` breaks them.
- Postgres allows 20 connections for the whole host, so Prisma is capped with
  `connection_limit` in `DATABASE_URL`.
- The box is memory-starved; backend and worker run with a capped V8 heap and
  pm2 `max_memory_restart`, and everything else on the host slows down under
  swap pressure. Acceptable for a dev server only.
