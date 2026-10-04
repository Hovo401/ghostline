# apps/mobile

Capacitor Android shell (ADR-0017, spec `docs/tasks/T-080-android-app.md`). The WebView loads the
live site (`server.url`), so UI changes ship with a normal frontend deploy; an APK is only needed
when native code changes. `android/` is real source, committed — not a generated folder.

- Web side of the native bridge lives in `apps/frontend/src/shared/native` (`isNativeApp()`
  guards every native call).
- `applicationId` is `app.ghostline` — never change it, users would get a different app.
- `build` is deliberately absent from `package.json`: Gradle needs the Android SDK, which
  `pnpm check` / CI must not require. The signed APK is built by `.github/workflows/android.yml`.
- `www/offline.html` is bundled and shown by `server.errorPath` on a first launch without network.

## Run against the local stack

```
pnpm dev                                # nginx on :80
adb reverse tcp:8080 tcp:80             # phone over USB, localhost = secure context
$env:CAP_SERVER_URL="http://localhost:8080/app"   # PowerShell
pnpm --filter @ghostline/mobile sync
pnpm --filter @ghostline/mobile open    # Android Studio → Run
```

Without `CAP_SERVER_URL` it points at `https://ghostline.diotek.pp.ua/app`.
Debug WebView: `chrome://inspect`.

App Links need `/.well-known/assetlinks.json` (in `apps/frontend/public`) with the signing
certificate's SHA-256. List both the debug and the release key's.

## Releasing an APK

Bump `versionName` / `minVersionCode` / `changelog` in `android-release.json`, then run the
**Android release** workflow (or push a tag `android-v*`). `versionCode` is the run number. It
publishes `ghostline-<code>.apk`, `ghostline.apk` and `latest.json` to `/downloads/android/`;
installed apps compare their build to `latest.json` and show the update banner. Raise
`minVersionCode` to make the banner undismissable. Keep a backup of the release keystore —
without it nobody can update in place.

## Push (Firebase)

FCM needs `apps/mobile/android/app/google-services.json` (gitignored). Without it the app still
builds, but `Ghostline.getPushRegistration` rejects with `UNAVAILABLE` and no push arrives.

- Get it: Firebase console → project settings → your Android app `app.ghostline` → download.
- CI: the **Android release** workflow writes it from the `GOOGLE_SERVICES_JSON_BASE64` secret and
  fails without it. `[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json"))`.
- The backend needs the service-account key separately: `fcm_service_account_json` in
  `deploy/group_vars/vault.yml` (`FCM_SERVICE_ACCOUNT_JSON` locally).
- Native code: Kotlin in `app/src/main/java/app/ghostline` (`GhostlinePlugin`, `push/`). Unit tests:
  `cd apps/mobile/android && ./gradlew testDebugUnitTest` (JDK 21). `PushCryptoTest` decrypts
  `packages/contracts/fixtures/native-push.json`, which the backend's `native-push.spec.ts` also checks
  — change the cipher layout in both or neither.
- Debug: `adb logcat -s GhostlinePush FirebaseMessaging`.

## Message notifications (T-084)

`messages/`: `MessageNotifier` builds one MessagingStyle notification per chat (tag `chat:<id>`) from
a `ChatThread` kept in SharedPreferences (`MessageHistoryStore`) — the FCM service dies between
pushes, so the second message needs the first from disk. "Ответить"/"Прочитано" go through
`MessageActionReceiver` → `NotificationActionApi` (plain `HttpURLConnection`, base URL from
`CapConfig.serverUrl`, authorized by the chat action token stored with the thread; no access token,
no WebView). `chat:read` drops lines up to `readSeq`, also while the app is in the foreground.

Plugin methods added in T-084 (`getPermissionStatus`, `openSystemSettings`, `clearNotifications`)
don't exist in older APKs — the site must call them through `shared/native/native-permissions.ts`,
which turns `UNIMPLEMENTED` into "no checklist".

## Incoming call (T-085)

`calls/`: `call:incoming` starts `IncomingCallService` (foreground type `phoneCall`), which posts a
`CallStyle.forIncomingCall` notification (channel `incoming_calls`, full-screen intent →
`IncomingCallActivity`, a Compose screen; ADR-0018) and runs `Ringer` (system ringtone + vibration,
skipped for silent/DND). The ring window is 45 s counted from the push's `createdAt`, so a late push
rings the rest of it, not a fresh 45 s. "Отклонить" goes through `CallActionReceiver` →
`NotificationActionApi.declineCall` with the push's `declineToken` — no WebView.

- `GhostlineMessagingService` still ignores `call:incoming` while the app is on screen: the page's
  own `IncomingCall` rings. `IncomingCall.tsx` stays silent only when the app is hidden **and**
  native push is registered, so an old APK or a failed registration never leaves a call silent.
- A `call:closed` can arrive before its `call:incoming` (FCM does not order): `RecentlyClosed` keeps
  the last 8 ids for 60 s. `stopSelf(lastStartId)` — not a bare `stopSelf()` — so a new call started
  right after a cancelled one is not torn down with it (same in `OngoingCallService`).
- "Проверить звонок" = `POST /notifications/test?kind=call`: the app shows the same screen for a
  `test-call` push (`callId` `"test"`, no network on decline), also with the app in the foreground.
- Emulator: the full-screen screen only shows when the screen is off or locked; with the screen on
  the same call is a heads-up notification. Check `dumpsys power | grep mWakefulness` before judging.

## Session cookie (ADR-0021)

The refresh token is an httpOnly cookie that rotates on every refresh, and the WebView's `CookieManager`
writes cookies to disk lazily. `MainActivity` calls `CookieManager.flush()` in `onPause`/`onStop` so a
swipe from Recents or an APK update right after a refresh can't bring back the previous cookie — which
the server would otherwise take for a stolen token and log the user out. Keep that flush.

## System bars (ADR-0020)

The WebView draws edge to edge. `viewport-fit=cover` in `apps/frontend/index.html` makes Capacitor's
`SystemBars` publish `--safe-area-inset-*` (and stop padding the WebView); the site's `--safe-*` tokens and
`p-safe`/`pt-safe`/`pb-safe` utilities in `shared/theme/theme.css` pad content with them. Backgrounds go
under the bars, content doesn't: any new `fixed inset-*` layer needs safe padding. Icon color follows the
theme through `SystemBars.setStyle` (`shared/native/native-system-bars.ts`). `styles.xml`'s bar colors only
matter at start-up and on Android ≤ 14.

## Answering and a call in progress (T-086)

- "Ответить" (screen and heads-up) answers at once: `IncomingCallActivity.answer()` unlocks the phone
  (`requestDismissKeyguard`; a cancelled unlock leaves the call ringing), puts `LaunchAction.Answer` in
  `LaunchActionStore` (in memory, 60 s, handed out once) and starts `MainActivity` with the same action as
  an extra. `MainActivity` stores it again and, if the page already listens to `callCommand`, emits it; a
  cold page picks it up with `Ghostline.consumeLaunchAction`. "Перезвонить" on a missed call is the same
  path with `LaunchAction.Callback`. The page ignores an answer for a call that is no longer incoming.
- `CallSession` mirrors `Ghostline.setCallState` (idempotent): `outgoing`/`connecting`/`active`/`reconnecting`
  keep `OngoingCallService` (FGS `phoneCall`, plus `microphone`/`camera` only when RECORD_AUDIO / CAMERA are
  granted — Android throws otherwise; `ongoingForegroundTypes`) and the Telecom entry in step;
  `ended`/`null` drop both. The notification is `CallStyle.forOngoingCall` (channel `ongoing_call`, low
  importance) with a timer from `answeredAt`; "Завершить"/"Микрофон" reach the page as `callCommand`
  (`hangup`/`toggleMute`), a tap on it as `open`. With no page to take `hangup` the notification just goes.
- `TelecomBridge` (core-telecom, ADR-0019) runs one coroutine per call inside `CallsManager.addCall`;
  `IncomingCallService` registers a ringing call there, so a `call:closed`/decline/timeout ends the entry
  (`RingEnd`), while an answer leaves it for `CallSession`. `addCall` failing (GSM call, missing permission)
  is logged and the call goes on without Telecom. Holds, audio routes and the headset button: see below (T-087).
- `setCallState`, `consumeLaunchAction` and the `callCommand` event don't exist in older APKs; the site calls
  them through `shared/native/native-call.ts`.

## Audio routes, proximity, hold (T-087, ADR-0022)

- `AudioRouter` (`calls/`) is the one owner of where a call's sound goes. With a Telecom entry `TelecomBridge`
  feeds it the endpoint flows and it switches with `requestEndpointChange`; if `addCall` failed `AudioFallback`
  does it with `AudioManager` (`MODE_IN_COMMUNICATION`, `setCommunicationDevice` on 12+, speakerphone/SCO
  below) and reports a lost audio focus as hold. Every change is an `audioRoutes` event; `getAudioRoutes` /
  `setAudioRoute` answer the page (`UNAVAILABLE` for a route that isn't connected). The rules (initial route,
  headset priority, the user's pick is kept, Bluetooth hidden without permission) are pure functions in
  `AudioRouteLogic.kt` and `HoldLogic.kt` (`decideRoute` leaves a route the list doesn't offer alone). Telecom's
  Bluetooth endpoints are never filtered; only the `AudioManager` path hides Bluetooth without the permission.
- `BLUETOOTH_CONNECT` is asked once, only when the `AudioManager` fallback starts and a Bluetooth output is around.
  Without it Bluetooth is simply not in the list.
- `ProximityLock` (screen off at the ear) lives in `OngoingCallService`: audio call, `connecting`/`active`,
  earpiece (`shouldHoldProximity`); released in `onDestroy`.
- Hold: Telecom `onSetInactive`/`onSetActive` (or audio focus without Telecom) -> `CallSession.onSystemHold(callId,
hold)` -> `hold`/`resume` `callCommand` plus "На удержании" in the notification. It applies only to the current
  call and only in `active`/`reconnecting` (`shouldApplyHold`). `NativeCallState.held` is native's own and is never
  read from the page's JSON. Telecom may not report the end of a GSM call, so while held `TelecomBridge` retries
  `setActive()` every 3 s (one loop per hold) unless a GSM call is on (`MODE_IN_CALL`/`MODE_RINGTONE`); the manual path is `Ghostline.resumeCall`
  (no args, `UNAVAILABLE` if nothing is held or Telecom refuses) behind the page's "Продолжить". Hold does not stop
  the camera of a video call (native can't): known limitation, ADR-0022.
- Headset: Telecom `onAnswer` on a ringing call runs `IncomingCallService.answer` (the same code as the
  "Ответить" button); `onDisconnect` from the system sends `hangup` (a ringing call is declined instead,
  `disconnectAction`). An entry the app ended itself is flagged `ending`, so the system's echo is not mistaken
  for the user. Limit: between a native answer and the page's `connecting` the entry is not yet marked answered,
  so a system disconnect in that gap counts as a rejection and does nothing. `IncomingCallService.answer` hands the
  answer straight to a listening page and only opens the app (`planAnswer`); otherwise it waits in
  `LaunchActionStore` and rides the intent, and `MainActivity` discards that copy if the page took it anyway.
  A page reloaded during a hold gets `hold` again with each state it reports (`shouldResendHold`).
- `getAudioRoutes`, `setAudioRoute`, `resumeCall`, `audioRoutes`, `hold`/`resume` are newer than the first APK: the site goes
  through `shared/native/native-call.ts`.
- Not verifiable on an emulator, check on a phone: Bluetooth headset (route list, switching, its button),
  wired headphones, a real GSM call during a call (hold and resume), the proximity sensor at the ear, that
  WebView audio really follows `requestEndpointChange` (ADR-0022 spike).
