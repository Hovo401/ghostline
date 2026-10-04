# 0018. Native call screens are Jetpack Compose, not XML views

Status: accepted

## Context

ADR-0017 puts the lock-screen incoming call (T-085) and the screens that follow it in native
Kotlin, because the WebView is dead when the call arrives. `apps/mobile/android` has no UI
toolkit yet: the only UI is the Capacitor `MainActivity`.

The incoming call screen has to look like Telegram's: a blurred avatar background, pulsing rings,
a swipe-up-to-answer gesture and an entrance animation. Later slices add an audio-route sheet
(T-087) and a compact picture-in-picture view (T-088).

## Decision

Native call screens are written in **Jetpack Compose** (compose-bom, ui, foundation, material3,
`activity-compose`; the Kotlin Compose compiler plugin matches `kotlinVersion`). Compose is used
only for activities of our own (`IncomingCallActivity` and its successors), never for the
Capacitor WebView host.

## Alternatives considered

- **XML layouts + `ViewPropertyAnimator`** — no new dependency, but pulsing rings, a draggable
  swipe target and a shared state flow between the service and the screen are a lot of
  imperative view code for what Compose states in a few lines. Every later call screen would
  repeat that.
- **Render the call screen in the WebView** — the WebView is not running when the call arrives,
  and cold-starting it on the lock screen is slow and unreliable.
- **A custom `Canvas` view only for the rings and plain views for the rest** — a hybrid that is
  harder to read than either approach on its own.

## Consequences

- The APK grows by roughly 2–4 MB (minify stays off, as in the rest of the app).
- The build needs the Compose compiler plugin; it is versioned with Kotlin, so a Kotlin bump moves
  both together.
- Native screens must take colors from `res/values/colors.xml`, never literals, mirroring the
  frontend's token rule.
- Compose stays confined to call screens. Anything that has to survive without the WebView still
  runs from services and receivers, not from composables.
