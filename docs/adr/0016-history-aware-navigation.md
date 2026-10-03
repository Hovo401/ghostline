# 0016. `/app` is a persistent layout; the open chat and every overlay are history entries

Status: accepted

## Context

There were two bugs with the same root cause: navigation state lived outside the router.

- **Opening Settings during a call cut the audio and hung up.** `/settings` was a sibling route of
  `/app`. Going there unmounted the `/app` component, and with it `CallRoot`, which owns the
  LiveKit `Room`. `useCallSession`'s cleanup ran `room.disconnect()`, and the server's
  `participant_left` webhook ended the call. The socket also lived in `Chat`, so it disconnected
  too and the tab never received `call:updated(ended)`. Coming back to `/app` rejoined a dead room
  with the stale token. Commit be54133 fixed the same kind of bug one level down, for the
  minimized call screen.
- **Back from a chat left the site.** The open chat was a Zustand flag (`selectedChatId`), and the
  URL never changed. The same was true of the profile panel, the media viewer, modals, popovers
  and the call screen. Back skipped all of them and went to `/login`, the landing page, or out of
  the installed PWA (`start_url: /app`). The Settings "←" was a `<Link to="/app">`, so it pushed a
  new entry instead of going back. Login and logout also pushed instead of replacing.

## Decision

Everything the user perceives as "a screen I can go back from" is a history entry. Everything that
must survive moving between screens lives in a layout above them.

- **`/app` is a layout route** (`routes/app.tsx`) with two children: `/app/` (chats) and
  `/app/settings`. The layout mounts `CallRoot`, `CallMiniBar`, `MediaViewer`, `Toaster` and
  `useMessengerSession()`, which covers the socket, realtime subscriptions, active-call resync,
  push and notification handoffs. None of these unmount on in-app navigation.
- **The open chat is `/app?chat=<id>`** (`features/chat/use-chat-navigation.ts`), not store state.
  `useOpenChat` pushes when opening from the list. It replaces when switching from one open chat
  to another, or when replacing an overlay entry such as the "new chat" modal. As a result, Back
  from any chat is exactly one step to the list, the way Telegram behaves on phone.
- **Overlays get a same-URL history entry** through `shared/lib/use-back-to-close.ts`, keyed by
  `state.glOverlay`. Back closes the top overlay, and closing an overlay any other way pops its
  entry. `Backdrop` calls the hook, which covers every modal, side panel and popover built on it.
  `MediaViewer`, `AttachPreviewDialog` and `CallScreen` call it directly. On the call screen,
  Back minimizes rather than hanging up.
- **"←" buttons step back in history only when the previous entry is ours**
  (`shared/lib/use-in-app-back.ts`, keyed by `state.inAppBack`, which is set when a chat or
  Settings is opened from inside the app). Otherwise, for a deep link, a reload or a notification
  click, they replace the entry with `/app`.
- **Leaving auth replaces history.** Login, register, logout and the `beforeLoad` guard redirects
  all use `replace: true`, so a signed-in Back never lands on `/login`.

## Alternatives considered

- **Lift `CallRoot` into `__root` and keep `/settings` as a sibling.** This fixes the call but not
  the socket, which lives in the messenger tree. Settings would still drop `call:updated`, and the
  zombie call would remain. It also mounts call code on public pages.
- **A path for the chat (`/app/chat/:chatId`, as REQUIREMENTS.md §4 originally sketched).** A
  different route match remounts the chat list on every open and close, losing the scroll position
  on desktop, where both columns are visible. Avoiding that needs an extra pathless layout. A
  search param gives the same history semantics with one `/app/` route.
- **Profile panel, viewer and modals in the URL (`?panel=profile`, …).** This would make them
  shareable and reloadable, but nobody needs to share "the profile panel open". It would also put
  every popover into the URL. A same-URL entry in history state gives the Back behavior without
  that cost.

## Consequences

- A call, the socket and its subscriptions survive any navigation inside `/app`. Any future
  messenger screen should be a child of the `/app` layout, never a sibling.
- Back and Forward step through chat, overlay and Settings the way users expect from Telegram. The
  system Back on Android, and the PWA, no longer exit from inside a chat.
- `useBackToClose` has to serialize: a `history.back()` is asynchronous in browsers, so a push
  requested while one is pending waits for it. Two overlays that open and close in the same tick
  are therefore deliberately ordered.
- An overlay whose component unmounts because of a route push, rather than closing first, leaves
  its entry in history. Back then lands on that entry and shows the same screen once.
- `features/chat` no longer reads or writes `selectedChatId`. Anything that needs "which chat is
  open" uses `useSelectedChatId()`.
