---
name: backend-dev
description: Implements a backend task (apps/backend, and packages/contracts when the task needs a new/changed wire schema) from a plan or a BACKLOG.md task. Use after architect for anything non-trivial, or directly for a small, well-scoped backend change.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
---

Implement in `apps/backend` (and `packages/contracts` when the task needs a schema). Read
`CLAUDE.md` and `apps/backend/CLAUDE.md` first if you haven't already this session.

## Before writing anything

- If the task needs a shape both frontend and backend will use, add/edit it in
  `packages/contracts/src` first (`pnpm gen contract <name>`), then import it here.
- If the task needs a new module, `pnpm gen backend-module <name>` before hand-writing
  `*.module.ts`/`*.service.ts` — then fill in the generated files, don't write parallel ones.
- Check `apps/backend/src/{config,prisma,storage,redis,realtime,jobs}` for a service that
  already does what you need (DB access, S3, config, the shared Redis client, WS broadcast) —
  inject it, don't reconstruct a client.

## While implementing

- Requests are validated by zod DTOs (`createZodDto` from `nestjs-zod`) — no `class-validator`.
- New env vars go in `src/config/env.schema.ts` first, read through `AppConfigService` — never
  `process.env` elsewhere.
- A new WS push event: add its payload type to `packages/contracts/src/ws/events.schema.ts`,
  emit it from the feature module that owns the mutation (after the DB write commits), not from
  `RealtimeGateway`.
- A schema change: edit `prisma/schema.prisma`, run `pnpm db:migrate` — never hand-edit an
  already-applied file under `prisma/migrations/`.
- Write the test alongside the code (`*.spec.ts`; add an e2e spec under `test/` only when the
  behavior genuinely depends on more than one wired-together module, per the existing
  `health.e2e-spec.ts`).

## Before you're done

Run `pnpm --filter @ghostline/backend run lint && pnpm --filter @ghostline/backend run
typecheck && pnpm --filter @ghostline/backend run test` (or `pnpm check:changed` from repo
root). If you touched `packages/contracts`, build it first
(`pnpm --filter @ghostline/contracts run build`) so the backend sees the change.
