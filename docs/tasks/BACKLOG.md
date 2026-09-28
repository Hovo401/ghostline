# Backlog

Stages match REQUIREMENTS.md §9. Pick one task, copy `_template.md` to `T-NNN-slug.md` if it
needs more than this row (a design decision to record, a non-obvious "done when"), work it,
check it off. Don't load the rest of this file into context beyond the stage you're in.

## M0 — Foundation

Scaffolded already (this repo, at the commit that added it): monorepo, Docker Compose (dev
watch + prod), CI, shared configs, generators, theme engine with Dark/Light + Signal accent,
base UI components, `AppConfigService`/`PrismaService`/`StorageService`/`RealtimeGateway`
skeletons, `User`/`Session` Prisma models, health checks. What's left:

- [ ] T-001 — Auth: registration (username + password), login, JWT access + refresh tokens with
      rotation, session list/revoke. FR-AUTH-01, 05–08. Needs `argon2` for password hashing
      (REQUIREMENTS §6.3) — not a dependency yet, add it with this task.
- [ ] T-002 — Recovery phrase: 12-word generation/verification, `/recover` flow, reissue.
      FR-AUTH-13–16.
- [ ] T-003 — Invites: registration modes (OPEN/INVITE_ONLY/CLOSED), invite CRUD, `/invite/:code`.
      FR-AUTH-02–04, 09.
- [ ] T-004 — Wire `RealtimeGateway`'s connection handler to real JWT verification and
      `user:${id}` room join (currently a documented TODO). Depends on T-001.

## M1 — Core chat

- [ ] T-010 — Chat + ChatMember + Message Prisma models, `seq` allocation (REQUIREMENTS §7.4).
- [ ] T-011 — Direct chats + Saved Messages: create-on-first-message, `directKey` uniqueness.
      FR-CHAT-01–02.
- [ ] T-012 — Send/edit/delete text messages over REST; `message:new`/`updated`/`deleted` over
      WS. FR-MSG-01–02, 05–08.
- [ ] T-013 — Read receipts (`lastReadSeq`) + delivery (`lastDeliveredSeq`), synced across a
      user's devices. FR-RT-04.
- [ ] T-014 — Chat list: ordering, unread counts, draft persistence (client-side), typing
      indicator wired to the real `typing` WS event. FR-LIST-01–05.
- [ ] T-015 — Reconnect sync: client requests `afterSeq=` on reconnect (REQUIREMENTS §7.5 MVP
      strategy — no `pts` journal yet, that's v1).
- [ ] T-016 — My profile + presence + "who sees what" privacy toggles. FR-USER-01, 03–04, 08.

## M2 — Groups and actions

- [ ] T-020 — Groups + roles (owner/admin/member), membership changes, system messages.
      FR-CHAT-03–05.
- [ ] T-021 — Group profile panel: members list, media/file/voice counts. FR-CHAT-06–07.
- [ ] T-022 — Reply, forward-free MVP scope check — reply only (forward is v1). FR-MSG-04.
- [ ] T-023 — User search (username/name). FR-USER-02.
- [ ] T-024 — Block user. FR-USER-05.
- [ ] T-025 — Disappearing messages: per-chat TTL, `expiresAt` on send, worker sweep + client-side
      hide. FR-CHAT-10–12. Depends on T-010, T-020 (owner/admin can set it in groups).

## M3 — Media

- [ ] T-030 — Attachment Prisma model + presigned upload flow (`StorageService` already has the
      two-client pattern — reuse it, don't add a third). REQUIREMENTS §7.6.
- [ ] T-031 — Media processor: thumbnails, EXIF strip, poster frames (extend
      `apps/backend/src/jobs/media.processor.ts` — currently a stub with a `TODO(media)`).
- [ ] T-032 — Photo/video/file messages in the composer and the feed, attachment preview before
      send, progress/cancel/retry. FR-MEDIA-01–09.
- [ ] T-033 — Fullscreen media viewer. FR-MEDIA-09.

## M4 — Voice and video notes

- [ ] T-040 — MediaRecorder-based voice recording + waveform capture. FR-VOICE-01–04.
- [ ] T-041 — Video note (circle) recording. FR-VOICE-06–07.
- [ ] T-042 — Format normalization in the worker (Chrome WebM/Opus, Safari MP4/AAC → one target
      format each browser plays). FR-VOICE-08.

## M5 — The wow layer (can run in parallel with M1–M4 — separate routes/chunk)

- [ ] T-050 — Home page 3D scene ("Decrypt"/particle field per hero variant chosen —
      DESIGN-BRIEF.md §6). FR-HOME-01, 04, 09; DR-04/DR-05/DR-09/DR-10.
- [ ] T-051 — Login/register screens per DESIGN-BRIEF.md §7.1.
- [ ] T-052 — `/dev/ui` grows into the full component/theme showcase (DR-19).
- [ ] T-053 — View Transition on theme switch (DESIGN-BRIEF.md §9 — decide if still wanted given
      the simpler 2-theme-plus-custom model that shipped instead of Protocol's original scope).

## M6 — v1

Web Push + PWA, reactions, forward, pinned messages, in-chat message search, admin UI (stats;
invites/users CRUD already partly in M0), remaining settings sections. FR IDs: see
REQUIREMENTS.md's "v1" priority rows — not broken into tasks yet, do that when M1–M5 are done
enough to know what's actually still missing.

## M7 — Open source

License file, CONTRIBUTING.md, self-host guide (expand README.md's quickstart), "write your own
theme" guide, secret-scanning check in CI.
