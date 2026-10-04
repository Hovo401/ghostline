# Ghostline — agent instructions

Web messenger without a phone number. Full product spec: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).
Visual design: [docs/DESIGN-BRIEF.md](docs/DESIGN-BRIEF.md). Architecture summary: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Decisions and why: [docs/adr/](docs/adr/). Current work: [docs/tasks/BACKLOG.md](docs/tasks/BACKLOG.md).

Nested `CLAUDE.md` files exist in `apps/backend/`, `apps/frontend/`, `apps/mobile/`, `packages/contracts/` —
read the one for the area you're touching; don't load all of them into context at once.

## Repo map

```
apps/backend      NestJS — REST API (main.ts) + BullMQ worker (main.worker.ts), same image
apps/frontend     React + Vite + TanStack Router (file-based routes)
apps/mobile       Capacitor Android shell over the live site + native Kotlin layer (ADR-0017)
packages/contracts  zod schemas + WS event types — the ONLY source of truth for the wire format
packages/config   shared tsconfig/eslint/prettier — apps extend this, never redefine rules
docker/           Dockerfiles, nginx configs, seaweedfs/certbot scripts
tools/generators  plop generators — use these instead of hand-writing boilerplate
docs/             requirements, design, architecture, ADRs, task backlog
```

## Commands

| Command                                                                | What                                                                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                             | Full stack, hot reload (`docker compose watch`)                                                      |
| `pnpm check:changed`                                                   | Lint + typecheck + test + build for packages changed since HEAD — run this before finishing any task |
| `pnpm check`                                                           | Same, for the whole repo, plus knip/jscpd/dependency-cruiser                                         |
| `pnpm gen <backend-module\|frontend-feature\|entity\|contract\|theme>` | Scaffold a new module/feature/entity/contract/theme                                                  |
| `pnpm db:migrate`                                                      | Prisma migration (dev)                                                                               |

## Hard rules

1. **The wire format lives in `packages/contracts` only.** A DTO, a zod schema, a WebSocket
   event payload — if both frontend and backend need to agree on its shape, it's a schema in
   `packages/contracts/src`, imported by both. Never redeclare the same shape in two places.
2. **No literal colors, radii or durations in frontend components.** Tokens only
   (`bg-bg`, `text-accent`, …) — see `apps/frontend/CLAUDE.md` and DESIGN-BRIEF.md §8.
   `themes/*.css` is the only place raw hex values belong.
3. **Search before writing.** Before adding a helper, a UI component, a validator — check
   `packages/contracts`, `apps/frontend/src/shared/`, and the relevant module's siblings for
   something that already does it. Duplicated logic is a defect, not a shortcut.
4. **Prefer a generator over hand-written boilerplate.** `pnpm gen backend-module chats` before
   hand-typing a `*.module.ts`/`*.service.ts` pair — same shape every time, fewer tokens spent
   getting there.
5. **No speculative abstraction.** Build what the current task in `docs/tasks/BACKLOG.md` needs.
   Don't add config options, extension points, or "for later" flexibility nothing calls yet.
6. **Cross-module backend imports go through the module's `*.module.ts` boundary**, not by
   reaching into another module's internals from three directories away.
7. **Every `TODO` names what unblocks it** — a task ID from BACKLOG.md or an ADR, not a bare
   "TODO: fix this".
8. **Inject `AppConfigService` in the backend, never read `process.env` directly** outside
   `apps/backend/src/config/env.schema.ts` — see that file for why.

## Definition of done

- `pnpm check:changed` passes.
- New logic has a test (colocated `*.spec.ts`/`*.spec.tsx`); a bugfix has a regression test.
- Public API changes (a new/changed contract, route, or WS event) are reflected in
  `docs/REQUIREMENTS.md`'s FR table if they change user-facing behavior.
- A non-trivial architectural choice made along the way gets an ADR
  (`docs/adr/NNNN-title.md`, copy the template) — don't let it live only in a commit message.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, …) — enforced by
  commitlint on commit.

## What not to do

- Don't disable a lint rule or skip a test to unblock yourself — fix the cause or ask.
- Don't hand-edit `apps/frontend/src/routeTree.gen.ts` or anything under `prisma/migrations/`
  that's already been applied.
- Don't add a new top-level dependency to work around something two lines of existing code
  already does.
