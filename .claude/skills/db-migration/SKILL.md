---
name: db-migration
description: Change the Prisma schema and create a migration. Use whenever a task needs a new model, field, index, or relation in apps/backend/prisma/schema.prisma.
---

1. Edit `apps/backend/prisma/schema.prisma` directly — add the model/field/index. Check
   `docs/REQUIREMENTS.md` §7.4 for the fuller target schema (the scaffold only has `User` and
   `Session`; other models are added module by module, not all at once).
2. From the repo root: `pnpm db:migrate` — prompts for a migration name, applies it against the
   dev Postgres (must be running: `pnpm dev` or at least `docker compose -f compose.dev.yaml up
-d postgres`), regenerates the Prisma client.
3. **Never hand-edit a file already under `prisma/migrations/`** once it's been applied — that
   breaks the migration history for everyone else's database. If a migration is wrong before
   anyone else has it, delete its folder and re-run step 2; if others might already have it,
   write a new migration that corrects it instead.
4. Update the service/module that owns this data to use the new field/model — a migration with
   no code reading/writing the new column is dead weight.
5. Verify: `pnpm --filter @ghostline/backend run typecheck` (Prisma's generated types will
   surface a mismatch immediately) and the relevant `*.spec.ts`/`*.e2e-spec.ts`.
