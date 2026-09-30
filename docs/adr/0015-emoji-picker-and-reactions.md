# 0015. Emoji panel via frimousse with self-hosted data; one reaction per user; no stickers yet

Status: accepted

## Context

FR-MSG-03 (emoji panel, MVP) was never built and FR-MSG-13 (reactions, v1) had no schema, route or
UI. The request was "Telegram-style": react to a message with an emoji, plus an emoji and sticker
panel. Three things needed a decision: which picker, where its data comes from, and what to do about
stickers.

Ghostline is a private messenger: a client opening the emoji panel must not hand the user's IP or
search terms to a third party, and every other asset (media, fonts, the service worker) already
ships from our own origin.

## Decision

- **Picker:** [frimousse](https://frimousse.liveblocks.io/) — headless (no shadow DOM, so it takes
  our tokens), virtualized, keyboard- and screen-reader-accessible, no dependencies. It has no
  "recent" list, so `features/chat/emoji-recent-store.ts` keeps the last 24 per device.
- **Data:** frimousse fetches Emojibase JSON from jsDelivr by default. `apps/frontend/
  emojibase.plugin.ts` serves the `ru` locale of the `emojibase-data` package from our own origin
  (`/emojibase/ru/*.json`: a dev middleware, an emitted asset in the build) and the picker points
  `emojibaseUrl` there. Only the one locale the UI uses ships, so search works in Russian.
- **Reactions:** one per user per message, as in free Telegram — a new emoji replaces the old one,
  picking it again clears it. `Reaction` is keyed `(messageId, userId)`; this supersedes the
  `(messageId, userId, emoji)` key sketched in REQUIREMENTS.md. `PUT`/`DELETE
  /messages/:id/reaction` return the updated `Message`, and every member gets it over the existing
  `message:updated` event (REQUIREMENTS.md §7.5 already reserved it for reactions), so there is no
  new WS event. `Message.reactions` is `{ emoji, count, userIds }[]` grouped server-side; `userIds`
  is there because one payload goes to every member, so each client works out "mine" itself.
- **Stickers: not now.** They stay `Later`. The sources considered are below.

## Alternatives considered

- **emoji-mart** — the de-facto picker, but it renders in a shadow DOM, which makes theming it with
  our token system hard.
- **emoji-picker-react** — comes with its own styling that we would have to override to match the
  tokens, where frimousse has none to fight.
- **Default jsDelivr data** — zero setup, but every panel open is a request to a third-party CDN.
- **Up to three reactions per user** — Telegram Premium behaviour; a more complex key, UI and
  server limit for no stated need.
- **A new `reaction:updated` WS event** — one more contract and handler when `message:updated`
  already carries the whole message and the client already upserts it.
- **Stickers from Telegram packs** — their terms and the pack authors' licences don't allow
  reusing them.
- **Stickers/GIFs from Tenor** — the API shut down on 2026-06-30.
- **Stickers/GIFs from GIPHY or Klipy** — large libraries with search, but they need an API key and
  attribution, have rate limits, and every search leaks the query and the user's IP to a third
  party. That contradicts the privacy stance above.
- **Own built-in packs** — the recommended route when stickers come back: open sets such as Noto
  Animated Emoji (CC BY 4.0, animated webp) hosted on our own storage, needing only an attribution
  line. User-uploaded packs would be a second step (pack/sticker models, S3 upload, management UI).

## Consequences

- The emoji panel and reactions work without any third-party request; the cost is one more
  `emojibase-data` dependency and a small Vite plugin. Emoji are drawn with the system font, so
  looks differ by platform.
- Emoji data is pinned to the installed `emojibase-data` version and changes only with a dependency
  bump.
- Adding more locales means adding them to `emojibase.plugin.ts` and the picker's `locale`.
- Reactions do not advance `seq`, so the `afterSeq` catch-up after a reconnect misses them until the
  history reloads — the same gap edits already have (BACKLOG T-074).
- Deleting a message or an account removes its reactions (`ON DELETE CASCADE`).
- Stickers need a follow-up decision (own packs) and likely a new `MessageType` plus a second
  attachment shape.
