---
name: new-frontend-feature
description: Scaffold a new feature under apps/frontend/src/features. Use when a task needs a new user-facing capability in the messenger UI that doesn't exist yet.
---

1. `pnpm gen frontend-feature <kebab-case-name>` — creates `index.ts`, `<PascalName>.tsx`,
   `<PascalName>.spec.tsx` under `apps/frontend/src/features/<name>/`.
2. Check `apps/frontend/src/entities/` for the domain data this feature needs; if it doesn't
   exist yet, use the `new-entity`-shaped step in `pnpm gen entity <name>` first (typed from
   `packages/contracts` if a schema exists there).
3. Build the UI with `shared/ui` primitives and token-backed Tailwind classes only (`bg-bg`,
   `text-fg`, `bg-accent`, …) — check the matching section of `docs/DESIGN-BRIEF.md` for the
   intended look before guessing.
4. Wire it into a route under `src/routes/` if it's not already reachable — thin route, feature
   does the work.
5. Server data through a TanStack Query hook in the entity, not ad-hoc `useEffect` fetching.
   Client-only state (drafts, toggles) through a colocated Zustand store if it needs to persist
   or be shared across components.
6. Verify: `pnpm --filter @ghostline/frontend run lint typecheck test`.
