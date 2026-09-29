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
