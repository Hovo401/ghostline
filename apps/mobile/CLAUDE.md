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
- "Ответить" opens the chat from the activity (a receiver may not start activities on Android 14+);
  accepting the call is T-086 (`TODO(T-086)`), so for now the page shows its own answer dialog.
- A `call:closed` can arrive before its `call:incoming` (FCM does not order): `RecentlyClosed` keeps
  the last 8 ids for 60 s. `stopSelf(lastStartId)` — not a bare `stopSelf()` — so a new call started
  right after a cancelled one is not torn down with it.
- "Проверить звонок" = `POST /notifications/test?kind=call`: the app shows the same screen for a
  `test-call` push (`callId` `"test"`, no network on decline), also with the app in the foreground.
- Emulator: the full-screen screen only shows when the screen is off or locked; with the screen on
  the same call is a heads-up notification. Check `dumpsys power | grep mWakefulness` before judging.
