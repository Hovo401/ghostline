# 0019. Register native calls with Telecom through Jetpack core-telecom

Status: accepted

## Context

ADR-0017 plans for the phone to treat a Ghostline call as a real call: audio focus, a held call when a
GSM call comes in, Bluetooth/wired/earpiece/speaker routes and the headset button. Android only gives
those to an app whose call is registered with Telecom.

The media stays in the WebView (LiveKit), so Telecom never sees the audio. What it needs from us is the
call's life cycle: ringing, answered, active, ended.

## Decision

Calls are registered through **`androidx.core:core-telecom`** (`CallsManager`, self-managed):
`registerAppWithTelecom` once, then `addCall` for every incoming and outgoing call, driven by the
phase the page reports through `Ghostline.setCallState`.

T-086 only registers and ends calls (answer, active, disconnect). Routes, hold and the headset button
are T-087, which starts with a spike: does core-telecom switch the audio of a WebRTC stream running
inside a WebView? If it does not, T-087 falls back to `AudioManager.setCommunicationDevice`, and this
registration stays, because it is what the system uses to rank and hold calls.

## Alternatives considered

- **Raw `ConnectionService`** — what core-telecom wraps; per-API-level boilerplate for no gain.
- **No Telecom, just a foreground service and `AudioManager`** — works for one call, but a GSM call
  would not put ours on hold, and Bluetooth/headset buttons would not reach us.

## Consequences

- One new dependency (`core-telecom`, plus coroutines it needs) and `MANAGE_OWN_CALLS`, which the app
  already declares.
- A failing `addCall` (for example during a GSM call) must not break the call: we log and carry on
  without Telecom.
- The call is registered before the page has accepted it, so a call answered natively and a call
  answered on another device both end the Telecom entry from the same push (`call:closed`).
