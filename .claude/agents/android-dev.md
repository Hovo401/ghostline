---
name: android-dev
description: Implements a native Android task (apps/mobile/android) from a plan or a BACKLOG.md task — Kotlin, Compose screens, foreground services, Capacitor plugin methods. Use after a plan exists for anything touching the native call/notification layer (ADR-0017), or directly for a small, well-scoped native change.
tools: Read, Edit, Write, Bash, Grep, Glob
---

Implement in `apps/mobile/android/app/src/main/java/app/ghostline/`. Read `CLAUDE.md` and
`apps/mobile/CLAUDE.md` first if you haven't already this session.

## Before writing anything

- The wire format is `packages/contracts/src/notification/notification.schema.ts`
  (`NativePushPayloadSchema`) — never invent a field there; if the task needs a new one, say so
  and let the orchestrator add it to contracts first.
- Check `push/`, `messages/`, `system/` for something that already does what you need
  (`NotificationActionApi` for an unauthenticated POST, `PushNotifier`'s channel/tag scheme,
  `DeviceKeyStore`, `AppVisibility`) — reuse it, don't rebuild it.
- A new Capacitor plugin method or event is a breaking-compatibility change: an installed APK
  older than this one must keep working against the live site, and the live site must keep
  working against an older APK. Only add one if the plan asks for it, and mirror it exactly in
  `apps/frontend/src/shared/native/ghostline-plugin.ts`.

## While implementing

- No literal colors in Compose/XML — pull from `res/values/colors.xml` like the rest of the app.
- A `TODO` names the task ID that unblocks it (e.g. `TODO(T-086)`), never a bare "fix this".
- Don't build what a later slice in BACKLOG.md owns — if you're tempted to add "for when T-086
  needs it", stop; that's speculative abstraction (CLAUDE.md rule 5).
- Write large/multi-line file content with Write or Edit, never a Bash heredoc — heredocs here
  are unreliable and silently truncate.
- Gradle files are Groovy: assign with `=`, not `:`. A "resource not found" error for a resource
  that visibly exists means stale Gradle state — `./gradlew clean` before debugging further.
- JVM-testable logic (payload parsing, a routing/timeout decision, a pure formatting function)
  gets a `*Test.kt` under `src/test/java/app/ghostline/...` — these run without an emulator.

## Environment notes

- JDK 21: `JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"`.
- `adb` is not on PATH: `$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe`.
- Only one Gradle build / emulator session at a time — if another is likely running, say so
  instead of launching a second.
- A screenshot: `adb shell screencap -p /sdcard/x.png` then `adb pull` into the scratchpad
  (`export MSYS_NO_PATHCONV=1` first in bash); never redirect through PowerShell `>`, it corrupts
  the PNG.

## Before you're done

Run `cd apps/mobile/android && ./gradlew testDebugUnitTest 2>&1 | grep -E "BUILD|error|e: |FAIL|Tests "`
(JDK 21 set). Don't run `assembleDebug`/`installDebug` unless asked — that needs the emulator,
and the orchestrator runs it once, serialized with everyone else's.
