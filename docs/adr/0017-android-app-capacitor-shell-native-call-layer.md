# 0017. Android app = Capacitor shell over the live site + a native call/notification layer

Status: proposed

## Context

ADR-0010 lists what a browser can't do:
- a full-screen incoming call on the lock screen;
- a continuous ringtone (we fake one by re-sending the push every ~4s);
- a "call in progress" notification with a timer;
- a guaranteed mic while the screen is off;
- earpiece/speaker/Bluetooth routing;
- picture-in-picture for video calls.

Its last paragraph names the way out: a native wrapper with FCM and the Telecom stack. Users want
Telegram-grade calls and notifications on Android, delivered as an APK downloaded from our own
server (not Google Play). iOS comes later, in the same `apps/mobile` project.

The UI, chat logic, LiveKit client and every contract already exist in `apps/frontend`. Rewriting
them natively would mean two clients to keep in sync.

## Decision

1. **Capacitor app in `apps/mobile`**, whose WebView loads **the live site** (`server.url` = our
   domain).
   - Every frontend deploy reaches every installed app immediately; no APK release is needed.
   - Same origin, so the httpOnly refresh cookie, relative `/api/v1`, `/socket.io` and
     `resolveLivekitUrl` work unchanged.
   - Offline start comes from two pieces: the service worker precaches the app shell, and a
     bundled native `offline.html` (`server.errorPath`) covers a first launch with no network.
2. **Everything that has to work while the WebView is dead is native Kotlin.** It lives in
   `apps/mobile/android`: one Capacitor plugin (`Ghostline`) plus Android services.
   - **Push:** a `FirebaseMessagingService` receiving **data-only, high-priority FCM** messages.
     This is the only channel Android reliably wakes a killed app with under Doze and OEM battery
     managers.
   - **Incoming call:**
     - a foreground service (`phoneCall`) rings the **system ringtone** in a loop and respects
       silent/vibrate/DND;
     - `NotificationCompat.CallStyle.forIncomingCall` with a full-screen intent opens a
       Telegram-style Compose `IncomingCallActivity` on the lock screen;
     - when the phone is unlocked, it shows as a heads-up CallStyle notification;
     - a local 45s timeout ends the ringing.
   - **Telecom:** calls are registered through **Jetpack `androidx.core:core-telecom`**
     (`CallsManager`, self-managed). It handles audio focus, GSM-call hold/resume,
     Bluetooth/wired/earpiece/speaker endpoints and headset buttons.
   - **Ongoing call:** a foreground service (`phoneCall|microphone[|camera]`) with
     `CallStyle.forOngoingCall`.
     - A chronometer counts from `call.answeredAt`.
     - It has mute/hang-up actions.
     - A proximity wake lock turns the screen off for earpiece audio calls.
     - Video calls get automatic picture-in-picture.
   - **Messages:** one notification per chat with inline reply and "Прочитано". It is dismissed
     when the chat is read on another device.
3. **Media stays in the WebView** (`livekit-client`, the same code as the web).
   - The native layer is a *reconciler*: JS reports the call phase through
     `Ghostline.setCallState`, and native raises or tears down services and notifications to match.
   - Native user actions (answer/hang up/mute) come back to JS as plugin events and run through
     the existing optimistic `useCallActions`.
4. **Native push is a second transport next to Web Push, authored once.**
   - `NotificationsService` keeps building `PushPayload`. The worker fans it out to
     `PushSubscription` rows (Web Push) and `NativePushDevice` rows (FCM).
   - For FCM, the payload is projected into the compact `NativePushPayload` (FCM data ≤ 4 KB) and
     **AES-256-GCM encrypted with a per-device key** that the app generates and registers. Google
     only sees ciphertext; Web Push is already encrypted per RFC 8291.
   - Actions that run without the WebView (decline, reply, mark read) use HMAC tokens carried in
     the payload, following the existing `declineToken`.
5. **Distribution: a signed APK on our server.**
   - CI builds a release APK with a keystore kept in CI secrets. nginx serves
     `/downloads/android/ghostline-<version>.apk` + `latest.json`.
   - Since the UI updates itself from the site, an APK release is only needed for native changes.
   - The app compares its `versionCode` with `latest.json` and shows a "Доступна новая версия"
     banner linking to the download (not dismissible below `minVersionCode`).

## Alternatives considered

- **Web assets bundled into the APK** — a slightly faster cold start, but every frontend change
  needs a new APK (or an OTA bundle updater). Auth would also move off the cookie: a cross-origin
  API, CORS, and refresh tokens in Keystore storage. It's a one-line config switch plus that auth
  work if it's ever wanted.
- **TWA (Trusted Web Activity)** — it is just Chrome: no FCM service, no full-screen call, no
  foreground service. It solves nothing ADR-0010 lists.
- **`@capacitor/push-notifications`** — it shows notifications itself and can't start a
  full-screen call activity from a data message while the app is killed. Two
  `FirebaseMessagingService`s in one app also conflict, so we use our own.
- **Our own persistent background connection instead of FCM** — it needs a permanent
  notification, drains the battery, and gets killed by Doze/OEM battery managers, so calls get
  lost. **UnifiedPush** needs a separate distributor app most users don't have. Both remain
  possible later as an extra transport for phones without Google Play Services.
- **React Native / fully native + LiveKit Android SDK** — the best possible call quality and
  battery life, but a second UI codebase. Moving *media only* to the LiveKit Android SDK stays
  possible later inside the same plugin, if WebView WebRTC becomes the bottleneck.
- **Raw `ConnectionService`** — what core-telecom wraps. Core-telecom is Google's current
  recommendation and removes the per-API-level boilerplate.

## Consequences

- **New Google dependency.**
  - It needs a Firebase project: `google-services.json` in the APK build and a service account
    for the worker.
  - The worker reads the optional `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_JSON` through
    `AppConfigService`. Without them, native push is off and the app works foreground-only.
  - Self-hosters who build their own APK need their own Firebase project.
- **Devices without Google Play Services** (Huawei, de-Googled) get no background push.
- **The live site must stay compatible with the oldest supported APK's plugin API.**
  - Frontend code guards every native call with `isNativeApp()` and plugin availability.
  - `minVersionCode` in `latest.json` is the lever for retiring an old shell.
- **The access token now carries `sid`**, so native device registrations are tied to a session.
  They are deleted on logout and on refresh-family revocation, because a soft revoke doesn't
  cascade.
- **Losing the release keystore means users can't update without uninstalling.** It is backed
  up off CI.
- **OEM battery killers** (Xiaomi, Huawei, Oppo/Vivo, some Samsung) can still block FCM for
  killed apps. A first-run permissions screen and the checklist in "Настройки → Уведомления"
  link to the exact system screens, and "Проверить звонок" proves the chain end to end.
- **Force-stopped apps get nothing until reopened.** That's Android's rule, not a bug.
- **iOS** (CallKit + PushKit VoIP via APNs) will be `apps/mobile/ios` under a separate ADR. The
  `Ghostline` plugin API is deliberately platform-neutral.
