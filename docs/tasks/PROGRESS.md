# MVP build progress

Driven by `/build-mvp` (`.claude/skills/build-mvp/SKILL.md`). Status: `[ ]` todo · `[~]` in
progress · `[x]` done. The orchestrator updates this after every phase; a new session resumes
from the first phase that isn't `[x]`.

| Phase | Status | Commit | Notes / blockers |
| ----- | ------ | ------ | ---------------- |
| F0 — Foundation (contracts, Prisma, deps) | [x] | 1cacc30 | Postgres dev volume was stale (auth failed); dropped and reinitialized. Host `DATABASE_URL` port was stale at 5432 vs compose's published 5433 — fixed in `.env.example`; **user must fix `.env` by hand** (protected file, tool can't edit it) — change `localhost:5432` to `localhost:5433`. Fixed a pre-existing Windows path bug in `tools/generators/plopfile.mjs` (mangled template paths, wrong dest dir) so `pnpm gen` works at all on Windows. |
| F1 — Design system (themes, tokens, ghost-field, primitives) | [x] | 1253ebb | Gate: `/dev/ui` checked in dark/light/terminal via Playwright at 1440×900 — accent green, fonts, radii match the prototype; terminal's `avatarFilled` effect confirmed. Fixed a real bug found in the gate: `GhostField`'s host div had no explicit height, so its absolutely-positioned `<ghost-field>` child (needs a sized containing block) rendered its canvas at 0px — added `h-full w-full`. Scroll-driven scene morph intentionally not wired (that's F6). |
| F2 — Auth | [x] | ce069b1 | Register/login/refresh-rotation/reuse-detection, `/me`, username availability, the `RealtimeGateway` JWT handshake. Frontend `onAuth` screen 1:1, auth guard, reload keeps the session. |
| F3 — Chat core (realtime, statuses, typing, list, profile panel) | [x] | ce069b1 | Direct chats + Saved Messages, seq allocation, send/edit/delete text, read/delivered honoring privacy toggles, presence, search, mute/block. Frontend `onChat` screen (rail, list, feed grouping, status glyphs, typing, composer, profile panel, phone layout). Gate: browser register→login→/app + reload; two curl-driven users verified open-direct/send/unread/read-status end-to-end. Fixed a real cross-cutting bug found in the gate: `packages/contracts`'s `export *` barrel didn't resolve through Rollup/Vite's CJS interop for a pnpm-symlinked workspace package — switched to explicit named re-exports plus `commonjsOptions.include`/`optimizeDeps.include` in `apps/frontend/vite.config.ts`. Also fixed a `POST /chats/:id/read` empty-body 400, a `/users/search` query-param mismatch (`query` vs `q`), and hid the deferred recovery-phrase login link. |
| F4 — Media, voice, video notes | [x] | 3d49809 | Presign/PUT/complete attachment pipeline, image/file/voice/video bubbles, attach menu, voice+video-note recording, profile panel media grid. Gate found and fixed two real bugs: (1) presigned PUT URLs carried a checksum computed against an empty body, rejected by SeaweedFS on the real upload — fixed with `requestChecksumCalculation: "WHEN_REQUIRED"` on the presign client; (2) deeper SigV4 mismatch from routing S3 through nginx's shared `/s3/` path prefix (rewrite stripped the prefix SeaweedFS never validated against) plus a `Host` header losing its port — fixed by giving SeaweedFS its own dedicated nginx port (`:8333`, no rewrite, `$http_host`) instead of a path prefix (ADR-0007, ADR-0008). Also fixed a regression the gate caught: message bubbles were hidden underneath the profile panel instead of reflowing when it opened. Verified for real: curl round trip (presign→PUT→complete→download, all 200) and a live Playwright pass (real image/file upload, rendering, media grid population, profile panel open/close). Voice/video *recording* couldn't be exercised by Playwright (no fake mic/camera) — see manual checks below. |
| F5 — My profile + settings | [ ] | | |
| F6 — Landing | [ ] | | |
| F7 — Review + final report | [ ] | | |

## Next step

F5 (recommended effort: high).

## Manual checks for the user

_(the orchestrator adds items it could not verify automatically, e.g. real mic/camera, Safari)_

- F0: host `.env`'s `DATABASE_URL` port is stale (`5432`) vs. what `compose.dev.yaml` publishes
  (`5433`). `.env.example` is fixed; `.env` is a protected file the tool can't edit — change
  `localhost:5432` to `localhost:5433` by hand, or `pnpm db:migrate` from the host will fail auth.
- F1: no real-browser WebGL check beyond this session's Playwright pass — worth a manual look at
  `/dev/ui`'s ghost-field scene and the gradient accents (aurora/sunset/mint) in an actual browser.
- F3: the two-user REST flow (open-direct, send, unread, read-status) was verified via curl since
  Playwright MCP's tabs share one browser context/cookie jar (can't hold two logged-in users at
  once). The realtime push side (`message:new`, `read:updated`, `typing`, `presence` actually
  landing in a second browser tab/socket) wasn't watched live — worth opening two real browser
  windows (or one normal + one incognito) and checking a message sent in one appears in the other
  without a reload, "печатает" shows while typing, and the online dot updates.
- F4: host `.env`'s `S3_ENDPOINT`/`S3_PUBLIC_URL` are stale (`http://localhost/s3`) after the
  nginx port fix (ADR-0008) — `.env.example` is fixed to `http://localhost:8333`; `.env` is a
  protected file the tool can't edit, so update it by hand the same way as F0's `DATABASE_URL`
  note above (docker compose itself doesn't need this — `compose.dev.yaml` overrides both vars
  directly for the `backend`/`worker` containers — but anything run against `.env` on the host
  needs the manual fix).
- F4: voice and video-note *recording* couldn't be exercised — Playwright's Chromium has no real
  mic/camera, so `getUserMedia` rejects (confirmed it fails gracefully, no crash). Worth a manual
  check in a real browser: record a voice message and a video note, confirm the live waveform/
  progress ring, send, and play both back.
