# 0006. `docker compose watch` (sync), not bind-mount volumes, for dev hot reload

Status: accepted

## Context

The primary dev machine targeted by this scaffold is Windows with Docker Desktop, where a bind
mount (`./apps/backend:/repo/apps/backend`) crossing the Windows-filesystem-to-WSL2-VM boundary
has meaningfully worse file-event latency and I/O throughput than on native Linux — `nest start
--watch` and Vite's HMR both depend on prompt, complete file-change events.

## Decision

`compose.dev.yaml` uses `develop.watch` with `sync` (and `sync+exec` for
`packages/contracts/src`, which also needs a rebuild — see that file's `x-contracts-watch`
anchor) instead of bind-mount volumes for the source directories that get hot-reloaded.

## Alternatives considered

- **Bind mounts** — simpler mental model (the file just *is* shared), but the latency problem
  above, plus needing `:delegated`/`:cached` mount-consistency tuning that behaves differently
  across host OSes — one more thing to get subtly wrong per-platform.
- **A file-watcher script polling and `docker cp`-ing changes** — `docker compose watch` already
  does exactly this, better, built into the tool everyone here already runs.

## Consequences

Editing `apps/backend/package.json` or `pnpm-lock.yaml` triggers a full `rebuild` action (slower
than a sync), by design — dependency changes need a real `pnpm install`, not a file copy.
Anyone developing on native Linux loses nothing by this choice (`watch` works identically there)
even though the latency problem it solves is Windows/Docker-Desktop-specific.
