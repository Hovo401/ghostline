# MVP build progress

Driven by `/build-mvp` (`.claude/skills/build-mvp/SKILL.md`). Status: `[ ]` todo · `[~]` in
progress · `[x]` done. The orchestrator updates this after every phase; a new session resumes
from the first phase that isn't `[x]`.

| Phase | Status | Commit | Notes / blockers |
| ----- | ------ | ------ | ---------------- |
| F0 — Foundation (contracts, Prisma, deps) | [x] | 1cacc30 | Postgres dev volume was stale (auth failed); dropped and reinitialized. Host `DATABASE_URL` port was stale at 5432 vs compose's published 5433 — fixed in `.env.example`; **user must fix `.env` by hand** (protected file, tool can't edit it) — change `localhost:5432` to `localhost:5433`. Fixed a pre-existing Windows path bug in `tools/generators/plopfile.mjs` (mangled template paths, wrong dest dir) so `pnpm gen` works at all on Windows. |
| F1 — Design system (themes, tokens, ghost-field, primitives) | [x] | 1253ebb | Gate: `/dev/ui` checked in dark/light/terminal via Playwright at 1440×900 — accent green, fonts, radii match the prototype; terminal's `avatarFilled` effect confirmed. Fixed a real bug found in the gate: `GhostField`'s host div had no explicit height, so its absolutely-positioned `<ghost-field>` child (needs a sized containing block) rendered its canvas at 0px — added `h-full w-full`. Scroll-driven scene morph intentionally not wired (that's F6). |
| F2 — Auth | [ ] | | |
| F3 — Chat core (realtime, statuses, typing, list, profile panel) | [ ] | | |
| F4 — Media, voice, video notes | [ ] | | |
| F5 — My profile + settings | [ ] | | |
| F6 — Landing | [ ] | | |
| F7 — Review + final report | [ ] | | |

## Next step

F2 + F3 (recommended effort: high).

## Manual checks for the user

_(the orchestrator adds items it could not verify automatically, e.g. real mic/camera, Safari)_

- F0: host `.env`'s `DATABASE_URL` port is stale (`5432`) vs. what `compose.dev.yaml` publishes
  (`5433`). `.env.example` is fixed; `.env` is a protected file the tool can't edit — change
  `localhost:5432` to `localhost:5433` by hand, or `pnpm db:migrate` from the host will fail auth.
- F1: no real-browser WebGL check beyond this session's Playwright pass — worth a manual look at
  `/dev/ui`'s ghost-field scene and the gradient accents (aurora/sunset/mint) in an actual browser.
