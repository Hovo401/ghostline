---
name: build-mvp
description: Orchestrate the full Ghostline MVP build from the design prototype, phase by phase, through backend-dev/frontend-dev subagents with quality gates. Use when the user runs /build-mvp or says "continue the MVP build". Resumes from docs/tasks/PROGRESS.md.
---

You are the **orchestrator**. Goal: a working messenger that looks and behaves exactly like the
prototype, for the fewest tokens. You plan, brief, verify, commit. You write code yourself only
in phase F0.

## 0. Start / resume

1. Read `docs/tasks/PROGRESS.md`. Continue from the first phase not marked `[x]`. If a phase is
   `[~]` (in progress), read its notes and `git log --oneline -5`, then finish it.
2. Check `docs/design/prototype/Ghostline.dc.html` exists. If it doesn't, stop and ask the user to
   copy `Ghostline.dc.html`, `ghost-scene.js`, `ghost-ui.js`, `support.js` there.
3. Working tree must be clean (`git status`). If not, commit the leftovers of the current phase
   or ask.

## 1. Economy rules (follow strictly)

- F1–F4: delegate to `backend-dev` / `frontend-dev` with `model: "sonnet"`. F0, F5, F6: do the
  work yourself, no subagents (cheaper than a cold start). Don't use `architect`. Use
  `reviewer` once, in F7, with `model: "sonnet"`.
- A brief is **≤ 25 lines**: goal · contracts to use (`@ghostline/contracts` names) · prototype
  section to match (by `data-screen-label` or template flag like `onChat`, `isVoice`, and the
  relevant `renderVals` keys) · files/dirs to touch · "done when". Never paste prototype HTML
  into a brief — the agent greps/reads the section itself with offset/limit.
- If a phase's backend and frontend depend only on contracts, launch both agents **in one
  message** (parallel).
- Fixes go to the **same agent via `SendMessage`** (warm context), not a new spawn.
- Max **3 fix rounds** per gate. Then log a blocker in PROGRESS.md and move on if later phases
  don't depend on it.
- Don't read whole files yourself. Use `git diff --stat`, targeted Grep/Read, and check output.
- Tests: unit tests for backend services (auth, seq/read, upload) and Zustand stores only. No
  e2e, no component tests.
- Scaffold with generators: `pnpm gen backend-module|frontend-feature|contract|theme`.
- After each phase: one Conventional Commit, update PROGRESS.md (status, commit hash, blockers,
  next step). Don't ask the user between phases unless a blocker breaks everything after it.
- **Session budget: at most 2 phases per session.** Session pairs: F0+F1 · F2+F3 · F4+F5 ·
  F6+F7. After the second phase's commit, update PROGRESS.md "Next step" and stop with:
  "Готово: <phases>. Открой новый чат и запусти /build-mvp (рекомендуемый effort: <next>)."
  Recommended effort: F2+F3 → high, F4+F5 → high, F6+F7 → medium.

## 2. Design rule (the most important one)

The prototype is the reference for looks and behavior. Carry over sizes, paddings, radii,
fonts, font sizes, Russian copy, transitions and animations **1:1**: the profile panel
`.5s cubic-bezier(.2,.8,.2,1)` with staggered fade, scramble text, typing dots, the video ring,
the password strength bar, toggle knobs, the hover states from `style-hover`.

It is a **spec, not code to copy**. Values go through tokens:

- Theme/accent hex values from the prototype `<style>` → `apps/frontend/src/themes/*.css`.
- Prototype variables `--bg --bg2 --panel --line --fg --mute --desk --in --ink --accent
--accent-t --accent-fill --avatar --avatar-fg --glow --glyph-a --bubble-r --fs --font` →
  Tailwind utilities in `shared/theme/theme.css`.
- Leftover literals: `#E5484D` becomes the `danger` token, `#E8A23B` becomes `warn`, and
  `rgba(0,0,0,.55|.6)` becomes `overlay`.
- Inline styles → Tailwind classes. No hex in `.tsx` (CLAUDE.md rule 2).

**Do NOT port:**

- the prototype's top control bar (screen tabs, desktop/phone, HERO A/B/C);
- demo data `CHATS`/`MSGS`;
- auto-replies `REPLIES`;
- `SAFETY` code.

The hero variant is a constant (default `a`, keep B/C in code).

**Deferred.** Hide these in the UI:

- groups (and "Покинуть группу");
- disappearing messages (the header timer button and the profile row);
- recovery phrase (registration is one step);
- the safety code;
- media transcoding.

## 3. Phases

Track these in PROGRESS.md. Each phase ends with the **gate** (section 4).

**F0: Foundation (you do it).**

- Contracts via `pnpm gen contract`:
  - `auth`: register, login, token response, me;
  - `user`: public profile, update-me, search, availability;
  - `chat`: list item, open-direct;
  - `message`: types text|image|file|voice|video, status, send;
  - `attachment`: presign request/response, complete.
- Replace the `unknown` payloads in `packages/contracts/src/ws/events.schema.ts`.
- Prisma, per REQUIREMENTS §7.4, minimal:
  - `Chat` (DIRECT|SAVED, `directKey` unique, `lastSeq`);
  - `ChatMember` (`lastReadSeq`, `lastDeliveredSeq`, `muted`);
  - `Message` (`seq`, `type`, `text`, `attachmentId`, `durationMs`, `waveform` Json);
  - `Attachment` (`key`, `mime`, `size`, `width`, `height`, `name`);
  - `Block`;
  - `User`: add `avatarKey`, `showOnline`, `readReceipts`.
- `pnpm db:migrate`. Deps: `argon2`, `@nestjs/jwt` (backend), `three` + `@types/three`
  (frontend).
- Also add BACKLOG.md's "Отложено" section if it's missing.

**F1: Design system (frontend-dev).**

- All themes from the prototype (dark, light, midnight, paper, terminal, plus system and
  custom) and all accents (signal, ion, ember, violet, aurora, sunset, mint, custom) → `themes/*.css`.
- Custom theme and accent are applied at runtime like the prototype's `applyCustom()`.
- `appearance-store`: theme, accent, font (sans|mono|pixel|serif), scale (s|m|l), bubble
  (round|sharp), decrypt, custom colors. Keep `index.html`'s inline script in sync.
- Google Fonts: Geologica, JetBrains Mono, Pixelify Sans, PT Serif.
- Port `ghost-scene.js` → `shared/ui/ghost-field/` (custom element, `three` from npm, plus a React
  wrapper) and `ghost-ui.js` → `Scramble`, `Dots` components (respect `decrypt` and
  reduced-motion).
- Primitives from the prototype: SegmentedTabs, Toggle, TextField, Avatar (initials, online
  dot, accent ring), IconButton, Rail. Show everything on `/dev/ui`.
- Gate: `/dev/ui` screenshots in dark and light.

**F2: Auth (parallel).**

- Backend:
  - register/login with argon2;
  - access JWT, plus a refresh token in an httpOnly cookie rotated via the existing `Session`;
  - `GET /me`, `GET /users/availability`;
  - the WS handshake verifies the token and joins `user:${id}` (the TODOs in
    `realtime/realtime.gateway.ts`).
- Frontend:
  - the `onAuth` screen 1:1 (tabs, hints, username availability, strength bar, the 3D panel on
    desktop);
  - an auth guard on `/app`;
  - token refresh in the API client.
- Gate: register → login → `/app`; a reload keeps the session.

**F3: Chat core (parallel).**

- Backend:
  - chat list (order, last message, unread count);
  - a direct chat is created on first message; Saved Messages;
  - send, and history by `seq` with a `beforeSeq` cursor;
  - `message:new`, delivered/read → `read:updated`;
  - presence honoring `showOnline`, with `readReceipts` off hiding reads both ways;
  - typing (already in the gateway);
  - user search, mute, block.
- Frontend, the whole `onChat` screen except media:
  - rail, list, search, "Новый" (user search);
  - header status line;
  - the feed: grouping, `gapTop`, status glyphs only on the last outgoing message;
  - the typing bubble;
  - composer (Enter sends);
  - the profile side panel;
  - the phone layout.
  - Data comes from Query, and the socket updates it via `setQueryData`.
- Gate: two users in two tabs. A writes → B sees the message and an unread badge; B opens the
  chat → A sees "✓✓ прочитано"; "печатает" shows in the header and the list; Saved Messages
  works.

**F4: Media, voice, video (parallel).**

- Backend:
  - presigned PUT and GET via `StorageService`'s public client (don't add a third client);
  - `complete` → `Attachment`;
  - message types image/file/voice/video with `durationMs` and a client-sent `waveform`;
  - leave `media.processor` as is, with its TODO pointing to "Отложено".
- Frontend:
  - the attach menu;
  - voice: `MediaRecorder` + `AnalyserNode` for the live bars, cancel/send;
  - video note: camera `getUserMedia`, a round preview, a 60s cap, the red progress ring;
  - bubbles 1:1: image, file chip, voice waveform with playback progress, and the round video
    with the accent ring;
  - the media grid in the profile panel;
  - list previews ("Голосовое · 0:12", "Фото", "Файл · name").
- Gate: send a photo, a file, a voice message, a video note; B can open and play each one.
  Record with Chromium fake-media flags if Playwright MCP allows it; otherwise mark it for the
  user's manual check.

**F5: My profile + settings.**

- The `onSettings` screen 1:1 (both tabs, desktop nav and phone tabs).
- Avatar upload via F4.
- `PATCH /me`: name, username with a check, bio ≤ 140, `showOnline`, `readReceipts`.
- The appearance preview and every control are live and survive a reload.
- Gate: every appearance control changes the whole UI; a profile save is visible to user B.

**F6: Landing.**

- The `onHome` screen 1:1:
  - the sticky `ghost-field` with scroll morph (`data-morph-track`) and the scrim;
  - nav, hero A, 3 stages, facts, CTA, footer.
- Buttons go to `/login` in login or register mode; "Как это работает" smooth-scrolls.
- Gate: scrolling morphs the scene to the "ghostline" word; the pointer repels glyphs.

**F7: Final.**

- `reviewer` (sonnet) on the diff since the F0 commit; fix only critical issues.
- Phone pass: screenshots at 390×844 of every screen vs the prototype's "Телефон" mode; fix
  layout mismatches.
- `pnpm check` for the whole repo.
- A final report in PROGRESS.md and to the user: what works, what doesn't, how to run it.

## 4. Gate (every phase)

1. `pnpm check:changed` passes.
2. The stack is up (`pnpm dev`, wait for health). The prototype is served separately:
   `npx serve docs/design/prototype -p 5055`; switch screens with its own top tabs.
3. Playwright MCP: run the phase scenario. Then take screenshots of the app **and** the
   prototype on the same screen at 1440×900 only (phone 390×844 is checked once, in F7), max 2
   rounds of screenshots per phase, and compare layout, colors, spacing,
   copy and states. Send every mismatch to the agent as a concrete list ("chat list width 340px,
   is 300px"; "outgoing bubble must use accent-fill with ink text").
4. Commit, then update PROGRESS.md.
