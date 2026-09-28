# apps/backend

NestJS. HTTP API + WebSocket gateway (`main.ts` → `AppModule`) and the BullMQ worker
(`main.worker.ts` → `WorkerModule`) are two entrypoints into the _same_ image — see the
`docker/backend.Dockerfile` comments and `docs/adr/0002-rest-plus-ws.md`.

## Where things go

| Kind of change                                | Goes in                                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New domain module (chats, messages, users, …) | `pnpm gen backend-module <name>` → `src/<name>/`                                                                                                              |
| Something every module needs (DB, S3, config) | Already exists — inject it, don't rewrite it: `PrismaService`, `StorageService`, `AppConfigService`, `REDIS_CLIENT`                                           |
| A background job                              | New `@Processor` in `src/jobs/`, registered in `ProcessorsModule` (worker-only) — the queue itself goes in `JobsModule` (shared, so the HTTP app can enqueue) |
| A WS event, its payload shape                 | `packages/contracts/src/ws/events.schema.ts` first, then handle it here                                                                                       |
| A new env var                                 | `src/config/env.schema.ts` (zod), then `AppConfigService` getter — nowhere else reads `process.env`                                                           |
| DB schema change                              | Edit `prisma/schema.prisma`, then `pnpm db:migrate` (dev) — never hand-edit a file under `prisma/migrations/`                                                 |

## Patterns already in the codebase — copy these, don't reinvent

- **Health checks**: `src/health/health.controller.ts` — the installed `@nestjs/terminus` version's
  `HealthIndicatorService.check(key)` only gives `.up()`/`.down()` (no `.attempt()`/`.withTimeout()`
  builder — that's a newer API some docs describe ahead of what's actually published; check the
  installed version's `.d.ts` before assuming a method exists). The controller's private
  `pingCheck()` helper is the try/catch + timeout pattern to copy for a new indicator. If you see
  `HealthIndicator`/`HealthCheckError` (the pre-v11 legacy API) in something you're reading, don't
  copy that either.
- **Validation**: request DTOs are zod schemas via `nestjs-zod`'s `createZodDto`, validated by the
  global `ZodValidationPipe` (registered in `app.module.ts`) — don't add `class-validator` decorators.
- **Realtime**: `RealtimeGateway` owns only the connection lifecycle and the `typing` event. A
  feature module that needs to push `message:new` etc. injects `@WebSocketServer() server` from
  its own place and emits to `user:${userId}` rooms — it doesn't add more `@SubscribeMessage`
  handlers to `RealtimeGateway` itself.
- **Two S3 clients in `StorageService`**: one for the backend's own calls (internal Docker
  hostname), one for presigned URLs (must be browser-reachable, `S3_PUBLIC_URL`). If you add a
  new storage operation, decide which one it needs — don't default to the internal client for
  anything a browser will hit directly.

## Testing

- `*.spec.ts` next to the file it tests, run by `pnpm test` (Vitest, mocked dependencies).
- `test/*.e2e-spec.ts` hits real Postgres/Redis/S3 — see `apps/backend/vitest.e2e.config.ts`'s
  header comment for what needs to be running first. Add one when a route's behavior depends on
  more than one module wired together correctly (the existing `health.e2e-spec.ts` is the shape
  to copy).
