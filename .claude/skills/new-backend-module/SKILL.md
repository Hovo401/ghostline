---
name: new-backend-module
description: Scaffold a new NestJS module under apps/backend/src. Use when a task needs a new backend domain module (chats, messages, users, admin, ...) that doesn't exist yet.
---

1. `pnpm gen backend-module <kebab-case-name>` — creates `<name>.module.ts`, `.service.ts`,
   `.controller.ts`, `.service.spec.ts` under `apps/backend/src/<name>/`.
2. Fill in the service/controller — inject `PrismaService`/`StorageService`/`AppConfigService`
   etc. from their existing modules rather than recreating a client; see
   `apps/backend/CLAUDE.md`'s "patterns already in the codebase" section.
3. Register the new module: add it to `apps/backend/src/app.module.ts`'s `imports`. If the
   module processes background jobs, its queue goes in `JobsModule` (shared) and its processor
   in `ProcessorsModule` (worker-only) — also add the module to `worker.module.ts` only if the
   worker process itself needs it (most feature modules don't).
4. If the module needs a request/response shape shared with the frontend, add it to
   `packages/contracts` first (see the `add-contract` skill) — don't declare the shape only in
   this module's DTOs.
5. Verify: `pnpm --filter @ghostline/backend run lint typecheck test`.
