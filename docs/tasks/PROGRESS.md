# MVP build progress

Driven by `/build-mvp` (`.claude/skills/build-mvp/SKILL.md`). Status: `[ ]` todo · `[~]` in
progress · `[x]` done. The orchestrator updates this after every phase; a new session resumes
from the first phase that isn't `[x]`.

| Phase | Status | Commit | Notes / blockers |
| ----- | ------ | ------ | ---------------- |
| F0 — Foundation (contracts, Prisma, deps) | [x] | 1cacc30 | Postgres dev volume was stale (auth failed); dropped and reinitialized. Host `DATABASE_URL` port was stale at 5432 vs compose's published 5433 — fixed in `.env.example`; **user must fix `.env` by hand** (protected file, tool can't edit it) — change `localhost:5432` to `localhost:5433`. Fixed a pre-existing Windows path bug in `tools/generators/plopfile.mjs` (mangled template paths, wrong dest dir) so `pnpm gen` works at all on Windows. |
| F1 — Design system (themes, tokens, ghost-field, primitives) | [ ] | | |
| F2 — Auth | [ ] | | |
| F3 — Chat core (realtime, statuses, typing, list, profile panel) | [ ] | | |
| F4 — Media, voice, video notes | [ ] | | |
| F5 — My profile + settings | [ ] | | |
| F6 — Landing | [ ] | | |
| F7 — Review + final report | [ ] | | |

## Next step

F0.

## Manual checks for the user

_(the orchestrator adds items it could not verify automatically, e.g. real mic/camera, Safari)_
