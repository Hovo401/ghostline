# Backlog

Stages match REQUIREMENTS.md §9. Pick one task, copy `_template.md` to `T-NNN-slug.md` if it
needs more than this row (a design decision to record, a non-obvious "done when"), work it,
check it off. Don't load the rest of this file into context beyond the stage you're in.

> **MVP build:** the M0–M5 tasks below are being executed as phases of `/build-mvp`
> (`.claude/skills/build-mvp/SKILL.md`), progress in [PROGRESS.md](PROGRESS.md). The
> "Отложено" section lists what that build deliberately leaves out.

## Отложено (out of the /build-mvp scope)

- Groups + roles, "Покинуть группу" (T-020, T-021)
- Disappearing messages (T-025): timer button hidden in the chat header and profile panel
- Recovery phrase (T-002): registration is one step
- Safety code / verification
- Media processing: thumbnails, EXIF strip, WebM↔MP4 transcoding (T-031, T-042)
- Invites (T-003), session list/revoke UI

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
- [x] T-012 — Send/edit/delete text messages over REST; `message:new`/`updated`/`deleted` over
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
- [ ] T-025 — "Delete for me" (per-user hidden messages) + group admins deleting any message.
      FR-MSG-06 remainder; admin part depends on T-020.
- [ ] T-025 — Disappearing messages: per-chat TTL, `expiresAt` on send, worker sweep + client-side
      hide. FR-CHAT-10–12. Depends on T-010, T-020 (owner/admin can set it in groups).

## M3 — Media

- [ ] T-030 — Attachment Prisma model + presigned upload flow (`StorageService` already has the
      two-client pattern — reuse it, don't add a third). REQUIREMENTS §7.6.
- [ ] T-031 — Media processor: thumbnails, EXIF strip, poster frames (extend
      `apps/backend/src/jobs/media.processor.ts` — currently a stub with a `TODO(media)`).
- [x] T-032 — Photo/video/file messages in the composer and the feed, attachment preview before
      send, progress/cancel/retry. FR-MEDIA-01–09.
- [x] T-033 — Fullscreen media viewer. FR-MEDIA-09. "Перейти к сообщению" split out to T-033b
      (needs `messageId` on `Attachment`).
- [ ] T-033b — Media viewer "перейти к сообщению": `messageId` on the `Attachment` contract,
      `GET /chats/:id/media` carrying it, and a feed scroll-to-message action wired from
      `MediaViewer`. Split out of T-033.

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

1:1 calls (LiveKit) + Web Push are broken into tasks below (docs/adr/0009, 0010, 0011). The rest
of M6 — forward, pinned messages, in-chat message search, admin UI (stats;
invites/users CRUD already partly in M0), remaining settings sections — isn't broken into tasks
yet; do that when this wave is done. FR IDs: see REQUIREMENTS.md's "v1" priority rows.

### Calls (FR-CALL-01–09, FR-NOTIF-06)

- [x] T-060 — `packages/contracts`: `Call`/`CallStatus`/`StartCallBody`/`CallJoin` schemas,
      `call:incoming`/`call:updated` WS events, `Message.type: "call"` + `MessageCallInfo`. Done.
- [x] T-061 — Prisma: `Call`, `PushSubscription` models, `MessageType.CALL` + `Message.callId`,
      `User.notifyMessages/notifyCalls/notifyPreview`. Done.
- [x] T-062 — Backend `calls` module: state machine (ringing/active/ended/missed/declined/
      cancelled/busy/failed), busy-lock + glare handling, LiveKit token minting, ring-timeout via
      BullMQ, LiveKit webhook finalization, call-outcome history message. Depends on T-060, T-061.
- [x] T-063 — LiveKit infra: `docker/livekit/livekit.yaml`, `compose.dev.yaml`/`compose.prod.yaml`
      services, nginx `rtc.${DOMAIN}` proxy + TURN-over-443 SNI routing, certbot domains.
- [x] T-064 — Frontend `entities/call` + `features/call`: call store, realtime hook, IncomingCall/
      CallScreen/CallMiniBar, LiveKit room wired for bad-network resilience (adaptive
      stream/simulcast/reconnect, connection-quality banner). Depends on T-060, T-062.
- [x] T-065 — Chat integration: call buttons in `ChatThreadPanel`, call history row in
      `MessageBubble`. Depends on T-064.

### Web Push notifications (FR-NOTIF-04/06, FR-SET-13)

- [x] T-066 — Backend `notifications` module: VAPID key endpoint, subscription CRUD, settings,
      push-send queue (message + call payloads), subscription cleanup on 404/410. Depends on
      T-060, T-061.
- [x] T-067 — Frontend service worker (`vite-plugin-pwa`, `injectManifest`) + `entities/
      notification`: push subscribe/unsubscribe flow, `NotificationsTab` in Settings, in-app vs.
      system-notification routing (docs/adr/0010). Depends on T-060, T-066.
- [x] T-068 — Closed-browser reachability follow-ups: `call:incoming` push re-sent every ~4s while
      `RINGING` (stand-in for a ringtone browsers can't play in the background), `call:closed`
      always shows a content-bearing (silent) replacement notification instead of a bare dismiss,
      "Ответить"/notification click on message or call opens/focuses the right chat or call
      (`?chat=`/`?call=&answer=1` deep link when no tab is open), per-platform hint in
      `NotificationsTab` (iOS install-to-Home-Screen / Android background permission / desktop
      background-apps setting), `call:missed` push TTL raised to 1 day. Depends on T-067.
- [x] T-069 — Logout action: "Выйти из аккаунта" in settings (`features/settings/LogoutButton`)
      unsubscribes this device's push subscription, then `POST /auth/logout`, clears the session
      and the query cache, and redirects to `/login`. Depends on T-067.

### Emoji panel + reactions (FR-MSG-03, FR-MSG-13; docs/adr/0015)

Stickers are not part of this wave (`Later`) — see docs/adr/0015 for the sources considered.

- [x] T-070 — `packages/contracts`: `ReactionEmojiSchema` (one grapheme, emoji-only),
      `SetReactionRequest`, `MessageReaction`, `Message.reactions`. Prisma `Reaction` model
      (PK `(messageId, userId)`, cascades) + migration.
- [x] T-071 — Backend: `MESSAGE_INCLUDE` loads reactions, `groupReactions`, `PUT`/`DELETE
      /messages/:id/reaction` via `MessagesService.setReaction` (member-only, block-aware, rides
      on `message:updated`). Depends on T-070.
- [x] T-072 — Frontend emoji panel in `Composer` (`features/chat/EmojiPicker`, frimousse, ru data
      served from our origin by `emojibase.plugin.ts`, "Недавние" in `emoji-recent-store`).
- [x] T-073 — Frontend reactions: `ReactionBar` chips under the bubble, quick-reaction row +
      "＋" picker in `MessageContextMenu`, optimistic `useSetReaction`. Depends on T-070, T-071,
      T-072.
- [ ] T-074 — Reactions don't advance `seq`, so the `afterSeq` catch-up after a reconnect misses
      them until the history reloads (same as edits today, FR-RT-05). Decide with the edit case.

### Android app — Capacitor (docs/adr/0017, spec: [T-080-android-app.md](T-080-android-app.md))

WebView loads the live site; native Kotlin owns push (FCM, encrypted), ringing, the full-screen
call screen, the ongoing-call service, audio routes and PiP. APK served from our server.

- [x] T-080a — Capacitor shell in `apps/mobile` (`server.url`, `offline.html`), `MainActivity`
      media/SW/permission setup, back button, App Links, `shared/native`, SW precache.
- [x] T-082 — CI-signed APK, `/downloads/android/` + `latest.json` on both deploy paths,
      "Скачать для Android" on Android web, in-app update banner (FR-APP-01). Depends on T-080a.
- [x] T-083 — Backend native transport: contracts, `NativePushDevice`, `sid` in the access token,
      optional FCM env, FCM HTTP v1 + AES-GCM, transport routing, action tokens + reply/read
      routes, `chat:read` push, test call.
- [x] T-083b — Android push client: messaging service, device key, registration from JS, logout
      unregister, settings status. Depends on T-080a, T-083.
- [x] T-084 — Message notifications (reply/read/dismiss), channels, permissions screen +
      checklist (FR-APP-05/07). Depends on T-083b.
- [x] T-085 — Native incoming call: ringing FGS, system ringtone, CallStyle + Compose
      `IncomingCallActivity`, token decline, timeout, missed call (FR-APP-02/06). Depends on T-083b.
- [x] T-086 — Answer flow, `use-native-call-bridge`, ongoing-call FGS with chronometer,
      core-telecom (FR-APP-03). Depends on T-085.
- [x] T-087 — Audio routes, proximity, GSM hold, headset button (FR-APP-04). Depends on T-086.
- [x] T-088 — Picture-in-picture for video calls (FR-APP-08). Depends on T-086.

### Session stays alive on Android (FR-AUTH-06; docs/adr/0021)

Users were logged out after reopening the app or after an update: the WebView lost the rotated
refresh cookie and the server took the old one for a stolen token.

- [~] T-089 — Previous refresh token accepted once (`Session.previousTokenHash`), `CookieManager.flush()`
      in `MainActivity`, frontend logs out only on a 401 and retries on network/5xx, single-flight
      refresh with a Web Lock. Code and migration (`add_session_previous_token_hash`) are done; open: deploy,
      release an APK (bump `android-release.json`).
- [ ] T-090 — Compare-and-swap on refresh rotation: two parallel refreshes with the same token can
      leave the client with a token the server no longer knows (one forced re-login). Do it only if
      logouts keep being reported after T-089 is live ~2 weeks. Depends on T-089.
- [x] T-091 — `/app` waits on `checking` forever while offline (`ensureSession` retries): show a
      "Нет сети, подключаемся…" state instead of a blank screen. Depends on T-089.

## M7 — Open source

License file, CONTRIBUTING.md, self-host guide (expand README.md's quickstart), "write your own
theme" guide, secret-scanning check in CI.
