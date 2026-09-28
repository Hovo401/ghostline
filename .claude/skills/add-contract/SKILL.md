---
name: add-contract
description: Add or change a shared zod schema (a DTO or a WebSocket event payload) in packages/contracts. Use whenever backend and frontend both need to agree on a shape — before writing the backend route or the frontend code that consumes it, not after.
---

1. `pnpm gen contract <kebab-case-domain-name>` — creates
   `packages/contracts/src/<name>/<name>.schema.ts` and appends the export to `src/index.ts`.
2. Write the zod schema + its inferred type, following `src/health/health.schema.ts`'s shape
   (one schema, one `z.infer` type, both exported). A WebSocket event payload instead goes into
   `src/ws/events.schema.ts`'s `ServerToClientEvents`/`ClientToServerEvents` maps, same pattern.
3. Build it: `pnpm --filter @ghostline/contracts run build` — both backend and frontend consume
   the built `dist/`, not `src/` directly, so this step is required before either can see the
   change (the dev containers do this automatically via a `sync+exec` watch rule; a one-off
   build outside `pnpm dev` needs the manual build).
4. Use it: import from `@ghostline/contracts` in the backend (as a `nestjs-zod` `createZodDto`
   for a REST DTO, or directly for a WS payload) and in the frontend (for the entity's
   TanStack Query types, or the socket client's event typing).
5. Verify: `pnpm --filter @ghostline/contracts run test typecheck`, then typecheck whichever of
   backend/frontend you changed to consume it.
