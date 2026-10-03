# 0010. Notifications always go through a service worker + Web Push, even tab-visible ones

Status: accepted

## Context

FR-NOTIF-03/04/05 need three related things: a sound/badge while the tab is open, a system
notification while the tab is open but not focused, and a system notification while the browser
is closed entirely (including installed PWA on Android/iOS 16.4+). The first two can be done
from the page itself (`document.hidden` + the `Notification` constructor); the third is only
possible through a service worker subscribed to Web Push, since there is no page execution
context left to react to anything.

Building two separate code paths — an in-page notifier for the tab-open case and a service
worker for the closed-tab case — means the same "new message" event produces a notification
through two different pieces of code that can drift out of sync (different copy, different
click-to-focus behavior, one gets a fix the other doesn't).

## Decision

Every message/call notification is authored once, as a `PushPayload` (packages/contracts), and
delivered once, through Web Push to the service worker (`src/sw.ts`), even when a tab is open.
The service worker checks whether a **visible** client already exists for this push; if so, it
hands the payload to that page via `postMessage` (in-app toast/sound) instead of calling
`showNotification` — so the in-app and system-notification cases share one payload shape and one
author, and only the last step (system notification vs. in-page toast) branches.

## Alternatives considered

- **In-page `Notification`/toast for the visible-tab and background-tab cases, Web Push only for
  the fully-closed case** — two authoring paths for what is conceptually one event; every future
  change to notification copy or click behavior has to be made twice and kept in sync by hand.
- **Web Push only when the app is confirmed closed (skip it while the tab is merely
  backgrounded), falling back to in-page `Notification` for the backgrounded-tab case** — saves
  a small number of push sends, but reintroduces the two-path drift this ADR avoids, for a
  distinction (backgrounded vs. closed) the browser already lets the service worker check itself.

## Consequences

Every notification-worthy event needs a `PushSubscription` row to actually reach a closed
browser — a user who never grants permission only gets the tab-open/backgrounded behavior
(handled by the same SW, just routed to `postMessage` while no push has an endpoint to deliver
to isn't quite right — practically, permission denial means no push ever arrives, so that
in-page path only fires while the tab itself is open to receive the WS event directly, same as
before this ADR). The service worker becomes a required piece of the frontend build
(`vite-plugin-pwa`, `injectManifest` mode) rather than optional PWA polish, and its payload
parsing must use the same zod schema (`PushPayloadSchema`) the backend authors against, so a
schema change to `packages/contracts` is felt on both ends immediately, per the root CLAUDE.md's
hard rule 1.

## Platform limits (no native equivalent in a browser)

Web Push can wake a closed browser, but it can't reproduce a native incoming-call screen. What
each platform actually gives us:

| Platform | Closed browser/app | Incoming-call UI |
| --- | --- | --- |
| Android, Chrome/Edge/Firefox | Delivered — the OS wakes the browser for push even after it's been swiped from recents. | A normal notification with `actions` ("Ответить"/"Отклонить"), sound, vibration. No full-screen lock-screen call UI and no continuous ringtone — those are native APIs (full-screen intent, `ConnectionService`) a web page can't reach. |
| iOS Safari 16.4+ | Delivered only if the site is installed to the Home Screen (PWA) — Safari push to a plain tab doesn't survive the app being closed. | No notification `actions` (iOS doesn't support them); tapping opens the app to the call screen. |
| Desktop Chrome/Edge (Windows/macOS) | Delivered only while the browser process is still running in the background (tray icon / "Continue running background apps"). If the process is fully quit, the push provider holds it for the payload's TTL and it arrives on next launch. | Same notification with actions as Android. |
| Desktop Firefox/Safari | Not delivered while the browser process is fully closed; arrives on next launch within TTL. | — |

Because there's no continuous ringtone, an incoming call re-sends the same `call:incoming` push
every ~4s while it's still `RINGING` (`CallsService.start` schedules the repeats alongside the
existing ring-timeout job) — the service worker's `tag`+`renotify` makes each arrival ring/vibrate
again, standing in for a ringtone. A `call:closed` push always carries a `reason`
(`"answered-elsewhere" | "ended"`) and always shows a (silent) replacement notification instead of
just clearing the old one silently — iOS revokes a subscription after repeated no-op pushes, and a
silent-with-no-notification push looks identical to a bug from the user's side.

A full lock-screen call experience like a native messenger's requires a native wrapper (e.g.
Capacitor/TWA with FCM + `ConnectionService`) — out of scope here; this ADR's decision covers what
a browser-only client can do. The Android app that does this is docs/adr/0017.
