# 0020. Draw the WebView edge to edge and pad content with safe-area tokens

Status: accepted

## Context

The Android shell (ADR-0017) put the WebView between two system bars painted a fixed dark color by
`styles.xml`, so on the light, Paper and custom themes the status and navigation bars showed as black
strips. Telling native the page's background color did not work either: `body` animates
`background-color` for 300 ms, so the color read on a theme change was always the previous one.

Android 15+ forces apps edge to edge anyway, and Capacitor 8's `SystemBars` plugin (`insetsHandling:
"css"`, the default) is built for it: once the page declares `viewport-fit=cover` it stops shrinking the
WebView and publishes the insets as `--safe-area-inset-*`.

## Decision

The page draws under the status/navigation bars and the camera cutout (`viewport-fit=cover`). Layers
keep their **background** edge to edge; their **content** is padded with `--safe-top/right/bottom/left`
(`shared/theme/theme.css`, utilities `p-safe`, `pt-safe`, `pb-safe`, `px-safe`). The tokens read
Capacitor's `--safe-area-inset-*` first and `env(safe-area-inset-*)` second (0 on desktop). Only the
bars' icon color follows the theme, through `SystemBars.setStyle` (`shared/native/native-system-bars.ts`).

A full-screen or edge-anchored element (`fixed inset-*`, a sheet, a toast) without safe padding is a
defect: its content can land under the camera or the gesture bar.

## Alternatives considered

- **Paint the bars from native with the page's color** — needs a new APK, races the theme transition,
  and still leaves a visible seam between the bar and the page.
- **Keep the WebView between opaque bars** — the strips never match a light or custom theme.
- **`env(safe-area-inset-*)` only** — wrong in Android WebView < 140 and loses the bottom inset while the
  keyboard is open; Capacitor's variables are corrected for both.

## Consequences

Backgrounds under the bars always match the theme and animate with it; no native color plumbing; already
installed APKs get it with a normal frontend deploy. Every new full-screen layer must remember the safe
padding. On Android ≤ 14 the bars' own colors (`styles.xml`) may still show as opaque strips — check on a
device and make them transparent if so (needs an APK).
