# 0001. One repo, pnpm workspaces + Turborepo

Status: accepted

## Context

Backend and frontend share a wire format (DTOs, WS event payloads) that has to stay in sync as
both evolve together, pre-v1, by one small team (and agents). Two repos would mean versioning
and publishing a shared package on every contract change just to keep them aligned.

## Decision

One repository (`apps/`, `packages/`, `tools/`), pnpm workspaces for linking, Turborepo for
task orchestration and caching (`pnpm check`, `pnpm check:changed`).

## Alternatives considered

- **Two repos + a published `@ghostline/contracts` package** — correct at a different team
  size; here it adds a publish-and-bump cycle to every contract change for no isolation benefit
  nobody needs yet.
- **npm/yarn workspaces instead of pnpm** — pnpm's stricter node_modules catches
  phantom-dependency bugs the others don't, and its content-addressable store keeps CI installs
  fast even as the workspace grows.
- **Nx instead of Turborepo** — more machinery (project graph, generators, plugins) than this
  repo's shape needs; Turborepo's task-graph-plus-cache is the whole problem here.

## Consequences

`packages/contracts` is importable by both apps with zero publish step (CLAUDE.md rule 1).
`turbo run <task> --filter="...[HEAD]"` makes `check:changed` fast even as the repo grows,
because only affected packages re-run. Cost: Docker builds need `turbo prune` to avoid shipping
the whole workspace into each image — see the Dockerfiles' `pruner` stage.
