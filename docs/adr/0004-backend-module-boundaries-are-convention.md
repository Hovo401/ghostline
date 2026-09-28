# 0004. Backend module boundaries: convention + circular-dependency check, not a hard lint rule

Status: accepted

## Context

The frontend has a strict, file-path-based layer order (`app → routes → features → entities →
shared`) that `eslint-plugin-boundaries` enforces well, because "which folder is this file in"
maps directly to "which layer is this." NestJS backend modules don't have that property: the
composition root (`app.module.ts`, `worker.module.ts`) legitimately imports every feature
module's `*.module.ts`, and Nest's DI graph — not folder depth — is what actually determines
which module can reach which provider. A path-regex rule strict enough to catch a real
violation (module A importing module B's internal service directly, bypassing `B`'s exported
API) also blocks the composition root's legitimate imports, without real AST/DI awareness.

## Decision

The rule is: reach a sibling module through its `*.module.ts`'s exports, not by importing a
file three directories into another module. It's stated in `apps/backend/CLAUDE.md` and
enforced by dependency-cruiser's `no-circular` rule (a real violation of this convention tends
to produce a cycle) plus code review — not by a bespoke eslint-plugin-boundaries config for the
backend.

## Alternatives considered

- **A path-regex boundaries rule for the backend, same as the frontend's** — prototyped; it
  either blocked the composition root's legitimate cross-module imports or, loosened enough to
  allow those, stopped catching the violation it was meant to catch. Not worth shipping broken.
- **A custom eslint rule with real Nest DI-graph awareness** — more machinery than this repo's
  current module count justifies; revisit if the backend grows enough for boundary violations
  to become a recurring problem rather than a rare one.

## Consequences

This boundary is weaker than the frontend's — a determined violation isn't blocked by CI, only
discouraged and caught in review. Acceptable while the team is small (including agents reading
CLAUDE.md before writing). Revisit (probably via the custom-rule alternative above) if that
stops being true.
