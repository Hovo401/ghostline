# 0022. Route a WebView call's audio through Telecom, with an AudioManager fallback

Status: accepted (the spike below is not yet verified on a device)

## Context

ADR-0019 registers every call with Telecom but leaves open whether that is enough to move the sound of a
WebRTC stream running inside the WebView: Telecom only learns the call's life cycle, the media never
touches it. T-087 (FR-APP-04) needs the earpiece by default for audio, the speaker for video, a connected
headset taking over, a route switcher on the call screen, and the call going on hold under a GSM call.

## Decision

Two sources behind one `AudioRouter` (`apps/mobile/.../calls`), which publishes the page's
`NativeAudioRoutes` (`audioRoutes` event, `getAudioRoutes`, `setAudioRoute`) and never exposes which
source is behind it:

- **Telecom entry present** — `TelecomBridge` collects `currentCallEndpoint` / `availableEndpoints` inside
  `addCall` and `AudioRouter` switches with `requestEndpointChange`. Telecom also delivers `onSetInactive` /
  `onSetActive` (hold/resume), `onAnswer` (the headset button on a ringing call) and `onDisconnect`
  (the headset button in a call).
- **`addCall` failed** (a GSM call is on, a missing permission) — `AudioFallback` puts the phone in
  `MODE_IN_COMMUNICATION` and routes with `AudioManager`: `setCommunicationDevice` /
  `availableCommunicationDevices` on Android 12+, `isSpeakerphoneOn` plus Bluetooth SCO below, an
  `AudioDeviceCallback` for plug/unplug, and an audio-focus request (`USAGE_VOICE_COMMUNICATION`) whose
  `LOSS_TRANSIENT` / `GAIN` stand in for hold/resume. The mode is reset when the call ends.

The initial route and later re-picks are one pure function (`pickRoute`): the user's own choice while that
device is connected, else wired, else Bluetooth, else speaker for video / earpiece for audio.
`BLUETOOTH_CONNECT` (runtime from Android 12) is asked once, at the start of a call, and only if a Bluetooth
output is already around; without it Bluetooth is left out of the list and the call is unaffected.

The proximity lock (`PROXIMITY_SCREEN_OFF_WAKE_LOCK`) lives in `OngoingCallService` and is held only for an
audio call in `connecting`/`active` through the earpiece (`shouldHoldProximity`).

Resuming from hold: Telecom does not reliably call `onSetActive` for a self-managed call when the GSM call
ends. While the entry is held, native therefore asks for the call back itself (`setActive()` every 3 s, one
loop per hold, skipped while `AudioManager.mode` is `MODE_IN_CALL`/`MODE_RINGTONE`, i.e. a GSM call is on;
`MODE_IN_COMMUNICATION` is allowed, since our own held call may keep it there), and the page has a manual "Продолжить" (`resumeCall`, rejects `UNAVAILABLE` if nothing is held or
Telecom refused). In the audio-focus fallback a `GAIN` (and a delayed re-request after a permanent
`AUDIOFOCUS_LOSS`) resumes.

Hold is native's own state (`NativeCallState.held`, never part of the JSON the page sends): it drives the
notification's "На удержании" and reaches the page as the `hold` / `resume` `callCommand`.

## Spike result

Not verified on a device. The emulator needs a full local stack and a second participant for a real
WebRTC call, which was not available while this was written; the design follows what the documentation
guarantees: a self-managed call's audio mode (`MODE_IN_COMMUNICATION`) is process-wide, and WebRTC in the
WebView plays through the same output stream the platform routes. What must be checked on a phone
(checklist in `apps/mobile/CLAUDE.md`): that `requestEndpointChange` really moves WebView audio, and that
the Telecom-less fallback does. If the first does not hold, the `TelecomLeg` in `AudioRouter` is replaced by
`AudioFallback` while the Telecom entry stays (ADR-0019 explains why it is still wanted).

## Known limits

- Hold only mutes and labels the call. Native cannot stop the camera the page publishes, so during a held
  *video* call the peer still sees the video; this is a deliberate limitation of the bridge.
- Between a native answer ("Ответить") and the page reporting `connecting`, the Telecom entry is not yet
  marked answered, so a system disconnect in that window is treated as a rejection of a ringing call (a no-op
  once the ring screen is gone) rather than a hang-up.
- `onSetInactive`/`onSetActive` are applied only for `active`/`reconnecting` calls (the page ignores `hold`
  elsewhere); a Telecom hold in another phase is still resumed by the polling above.
- To check on a phone: which `AudioManager.mode` a held call leaves behind after the GSM call, whether
  `setActive()` is refused while it is on, and whether the loop could take the call back from another app's
  VoIP call (mode `IN_COMMUNICATION`); the manual resume covers a miss.
- A page that reloads during a hold is told `hold` again with every state it reports for the held call.
- A headset answer reaches a listening page directly (`emitCommand`) and only opens the app; the
  `LaunchActionStore` copy exists solely for a page that is not listening.

## Alternatives considered

- **`AudioManager` only, no Telecom routing** — works, but a Telecom call would then have two owners of the
  route (the system's own switching and ours) fighting over it.
- **Telecom only** — a call that Telecom refused (GSM in progress) would have no switcher and no hold.
- **A new plugin method per capability** — the contract stays small: one list, one setter, one event.

## Consequences

- The page only needs `getAudioRoutes` / `setAudioRoute` / `audioRoutes` (and `hold` / `resume`); an older
  APK rejects them with `UNIMPLEMENTED` and the page shows no switcher.
- Two code paths to keep honest; the fallback is exercised only during a GSM call or without the permission.
- A user's pick is forgotten when its device disconnects, so reconnecting a headset takes the call back.
- Volume keys control the call stream while a call runs (`volumeControlStream`, set from the plugin's activity).
