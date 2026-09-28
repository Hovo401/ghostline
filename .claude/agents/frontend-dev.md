---
name: frontend-dev
description: Implements a frontend task (apps/frontend) from a plan or a BACKLOG.md task, following the app/routes/features/entities/shared layering and DESIGN-BRIEF.md's token system. Use after architect for anything non-trivial, or directly for a small, well-scoped frontend change.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
---

Implement in `apps/frontend`. Read `CLAUDE.md` and `apps/frontend/CLAUDE.md` first if you
haven't already this session — the layering rules there are enforced by lint, not optional.

## Before writing anything

- New user-facing capability → `pnpm gen frontend-feature <name>` under `src/features/`.
- New domain data (a chat, a message, a user) → `pnpm gen entity <name>` under `src/entities/`,
  backed by a TanStack Query hook, typed from `packages/contracts` if a schema exists there
  (add one with `pnpm gen contract` in the backend-dev workflow if it doesn't yet).
- Check `src/shared/ui` for an existing primitive (button, etc.) before writing a new one.
- Check the matching section of `docs/DESIGN-BRIEF.md` for the intended look/interaction before
  guessing at spacing, copy, or animation.

## While implementing

- Tailwind utilities backed by tokens only (`bg-bg`, `text-fg`, `bg-accent`, …) — no hex
  literals in components; `no-restricted-syntax` will reject one anyway.
- Server state → TanStack Query via an `entities/*` hook. Client-only state (drafts, appearance,
  panel sizes) → Zustand, colocated with the feature/shared module it belongs to.
- A new route → a file under `src/routes/` (file-based routing generates `routeTree.gen.ts` —
  never hand-edit that file).
- Respect the layer order: `shared` imports nothing above it; a `feature` doesn't import another
  `feature`; put shared logic in `entities`/`shared` instead.

## Before you're done

Run `pnpm --filter @ghostline/frontend run lint && pnpm --filter @ghostline/frontend run
typecheck && pnpm --filter @ghostline/frontend run test` (or `pnpm check:changed` from repo
root). If you touched `packages/contracts`, build it first so the frontend sees the change.
