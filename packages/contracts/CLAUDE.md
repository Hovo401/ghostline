# packages/contracts

The single source of truth for anything backend and frontend must agree on: request/response
DTOs (as zod schemas, consumed by `nestjs-zod` on the backend) and WebSocket event payloads
(`ServerToClientEvents`/`ClientToServerEvents`, see `src/ws/events.schema.ts`).

## Rules

- One zod schema, one `z.infer` type, both exported — see `src/health/health.schema.ts` as the
  reference shape. `pnpm gen contract <name>` scaffolds this and wires the export into `index.ts`.
- No NestJS or React imports here, ever — this package is plain TypeScript + zod, importable
  from both runtimes unmodified.
- A schema changes in lockstep with the two things that use it. Don't add a field "for later" —
  add it when the backend route or WS event that produces it exists.
- Consumers import the **built** package (`@ghostline/contracts` → `dist/`, via `exports` in
  `package.json`), not `src/` directly — `pnpm build` (or the dev container's `sync+exec` watch
  rule, see `compose.dev.yaml`) has to run after an edit for other packages to see it. If a
  change here doesn't seem to show up in the backend/frontend dev container, check that the
  `sync+exec` rebuild actually ran (`docker compose -f compose.dev.yaml logs -f backend`).
