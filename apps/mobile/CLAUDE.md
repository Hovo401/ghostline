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
