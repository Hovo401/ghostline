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
  is logged and the call goes on without Telecom. Holds, audio routes and the headset button: T-087.
- `setCallState`, `consumeLaunchAction` and the `callCommand` event don't exist in older APKs; the site calls
  them through `shared/native/native-call.ts`.

## Picture-in-picture (T-088)

- `MainActivity` is `supportsPictureInPicture`; `calls/PipLogic.kt` holds the pure part: `pipAllowed(state)` =
  video call in `active`/`reconnecting`, `pipActions(state)` (mic toggle by `muted`, then hang up), 9:16.
- `CallSession.stateListener` (set in `onStart`, cleared in `onDestroy`; posted to the main thread) makes the
  activity refresh `setPictureInPictureParams` on every state change, `muted` included. Android 12+: params
  carry `setAutoEnterEnabled(pipAllowed)`; 8-11: `onUserLeaveHint` calls `enterPictureInPictureMode`.
- The window's buttons are `RemoteAction`s on the existing `OngoingCallActionReceiver` (`ACTION_TOGGLE_MUTE`,
  `ACTION_HANGUP`), so they reach the page as `callCommand` like the notification's. No new receiver.
- `onPictureInPictureModeChanged` -> `Ghostline.pipModeChanged {active}` and `AppVisibility.foreground =
!inPip` (with only the window up, message pushes show). Dismissing the window (X / swipe) removes the task and
  destroys the activity, WebView and LiveKit with it, so the call can't survive: it is ended with
  `CallCommand.Hangup` while the page still exists (mode change to "out" below `STARTED`, or `onStop` outside PiP
  with `pipActive`; `endsCallOnPipClose`). Expanding the window is not a dismissal. NOT verified live yet
  (needs a real video call): reviewer's reading of AOSP, check on a phone that no ghost notification stays.
- Devices without `FEATURE_PICTURE_IN_PICTURE` skip every PiP call (they throw `IllegalStateException`), which
  are also wrapped in try/catch. If the call ends while the window is up the activity goes `moveTaskToBack`.
- In PiP the activity is not stopped, so the WebView is never paused (Capacitor `KeepRunning` defaults to true,
  so `onPause` only notifies plugins), otherwise the video freezes. Keep the cookie flush in `onPause`/`onStop`
  (ADR-0021).
- `pipModeChanged` doesn't exist in older APKs; the site listens through `shared/native/native-call.ts`.
