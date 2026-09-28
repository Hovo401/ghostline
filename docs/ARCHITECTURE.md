# Architecture — agent reference

One page, for agents. Full detail and rationale: [REQUIREMENTS.md](REQUIREMENTS.md) §7, and the
[ADRs](adr/) for anything marked with one below.

## Shape

```
                         ┌──────────┐
  browser  ──HTTPS──▶   nginx   ──┬──▶ backend (Nest: REST /api/v1 + Socket.IO /socket.io)
                         └──────────┘  │
                              │        ├──▶ postgres (Prisma)
                              │        ├──▶ redis/valkey (BullMQ, Socket.IO adapter, presence)
                       serves SPA      └──▶ seaweedfs (S3 API)
                       static files             ▲
                                                 │
                                          worker (Nest, BullMQ processors — same image as backend)
```

Two runtime processes share the `backend` image: `main.ts` (HTTP + WS, `AppModule`) and
`main.worker.ts` (BullMQ only, `WorkerModule`). See `apps/backend/CLAUDE.md`.

## Rules that shape the code

- **Changes via REST, delivery via WebSocket.** Send/edit/delete/mark-read are REST calls
  (validation, idempotency, retries are simpler there); Socket.IO carries server→client push
  and the one client→server ephemeral event (`typing`). — [ADR-0002](adr/0002-rest-plus-ws.md)
- **`packages/contracts` is the only place a shape is defined once for both sides.** A DTO or a
  WS payload declared separately in `apps/backend` and `apps/frontend` is a bug.
- **Browser uploads/downloads go straight to S3** via presigned URLs the backend issues
  (`StorageService`) — file bytes never pass through the backend process.
- **Every WS event is scoped to a real, checked user.** `RealtimeGateway` disconnects sockets
  without a token; a feature module resolves the user before emitting to `user:${id}` rooms.
- **Ordering is server-authoritative.** Each chat has a monotonic `seq`; clients reconcile after
  reconnect by asking for everything after their last known `seq` (see REQUIREMENTS §7.5).
- **Frontend layering** (`app → routes → features → entities → shared`) is enforced by
  `eslint-plugin-boundaries` — see `apps/frontend/CLAUDE.md`. **Backend module boundaries** are a
  convention (cross-module imports go through a module's own `*.module.ts`), checked by
  `dependency-cruiser`'s circular-dependency rule and by review, not by a hard lint rule —
  [ADR-0004](adr/0004-backend-module-boundaries-are-convention.md).

## Where a new capability's pieces go

| Piece | Location |
|---|---|
| Wire shape (DTO, WS payload) | `packages/contracts/src/<domain>/` |
| Backend logic | `apps/backend/src/<domain>/` (own module) |
| A background job | `apps/backend/src/jobs/` (queue in `JobsModule`, processor in `ProcessorsModule`) |
| Frontend feature UI | `apps/frontend/src/features/<name>/` |
| Frontend domain data (types, query hooks) | `apps/frontend/src/entities/<name>/` |
| A new theme | `apps/frontend/src/themes/<id>.css` — [DESIGN-BRIEF.md §8](DESIGN-BRIEF.md) |

## Infra

Docker Compose, two files: `compose.dev.yaml` (watch-based hot reload — [ADR-0006](adr/0006-docker-compose-watch-on-windows.md)) and
`compose.prod.yaml` (nginx does TLS via certbot + reverse-proxy + serves the built SPA — one
container, not two — [ADR-0005](adr/0005-nginx-not-caddy.md)). Object storage is SeaweedFS
([ADR-0003](adr/0003-seaweedfs-not-minio.md)), talked to over the S3 API, so any S3-compatible
provider is a drop-in swap in prod.
