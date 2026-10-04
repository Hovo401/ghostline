# T-080. Android app (Capacitor): Telegram-grade calls and notifications

Status: in-progress
Requirements: FR-NOTIF-04/06/07, FR-CALL-02/03/04/09 (native upgrade); new FR-APP-01…08 (below)
Decision: docs/adr/0017

## What

An Android app (APK from our server). Its WebView loads the live site and adds what a browser
can't do:
- a full-screen Telegram-style incoming call on the lock screen, ringing with the system
  ringtone, even when the app is killed;
- a "call in progress" notification with a live timer and controls;
- a mic that keeps working with the screen off;
- earpiece/speaker/Bluetooth routing, proximity, GSM-call hold;
- picture-in-picture for video calls;
- message notifications with inline reply and "Прочитано".

The BACKLOG rows T-080a…T-088 are this epic's slices.

## FR rows (add to REQUIREMENTS.md §5.11/§5.14 as each slice lands)

| ID | Requirement |
| --- | --- |
| FR-APP-01 | Android app (APK from our server). On Android web, "Установить приложение" becomes "Скачать для Android" (APK + sideload hint). Hidden inside the app. UI updates come from the site; an in-app banner offers a new APK when the native shell changes (not dismissible below the minimum version). |
| FR-APP-02 | Incoming call with the app closed or the screen locked: full-screen call screen (blurred avatar, name, "Аудиозвонок/Видеозвонок Ghostline", pulsing rings, Ответить/Отклонить + swipe up to answer). It rings with the system ringtone + vibration and respects silent/vibrate/DND; the power button silences it. On an unlocked screen it shows as a heads-up call notification. Times out at 45s. |
| FR-APP-03 | Call in progress: ongoing notification "Идёт звонок · <имя>" with a live timer and "Микрофон"/"Завершить". Tapping it opens the call screen. The call survives the screen being off and the app going to the background. |
| FR-APP-04 | Audio routing: earpiece by default for audio, speaker for video; a connected headset takes over. Switch Телефон/Динамик/Bluetooth/Наушники from the call screen. The screen turns off near the ear. A GSM call puts ours on hold and resumes it afterwards. The headset button answers/hangs up. |
| FR-APP-05 | Message notifications: one per chat, recent lines, inline reply, "Прочитано". They disappear when the chat is read (or replied to) on any device. Per-chat mute and the preview setting are respected. |
| FR-APP-06 | Missed call notification with "Перезвонить". |
| FR-APP-07 | First-run "Чтобы не пропускать звонки" screen and the same checklist in "Настройки → Уведомления": notifications, full-screen calls (Android 14+), battery optimization, OEM autostart, plus "Проверить звонок" (a test call screen in 5s). |
| FR-APP-08 | Picture-in-picture for an active video call when leaving the app, with mute/hang-up actions. |

## Slices

| Slice | What |
| --- | --- |
| T-080a ✅ | Capacitor shell (`apps/mobile`, `server.url`, `offline.html`), `MainActivity` (no gesture requirement for media, SW → bridge, WebView permissions), back button, App Links, `shared/native`, SW precache for an offline shell |
| T-082 ✅ | CI-signed APK, `/downloads/android/` + `latest.json` (both deploy paths), "Скачать для Android" on Android web, in-app update banner |
| T-083 | Backend native transport: contracts, `NativePushDevice`, `sid` in the access token, register/unregister, optional FCM env, FCM HTTP v1 client + AES-GCM, transport routing (ring-repeat web-only, `chat:read` native-only), action tokens + reply/read routes, test call |
| T-083b | Android push client: Firebase Messaging service, device key, registration from JS, logout unregister, settings status |
| T-084 | Message notifications (reply/read/dismiss), channels, permissions screen + checklist |
| T-085 | Native incoming call: ringing FGS + system ringtone, CallStyle + premium Compose `IncomingCallActivity`, token decline, timeout, `call:closed`, missed call + "Перезвонить" |
| T-086 | Answer → app → accept; `use-native-call-bridge` (phase → `setCallState`), ongoing FGS + chronometer + actions, core-telecom for incoming/outgoing |
| T-087 | Audio routes (spike first), `AudioRouteSheet`, proximity, GSM hold, headset button |
| T-088 | Picture-in-picture for video calls |

## QA matrix

Devices: Pixel/stock Android 10, 13, 14, 15/16; Samsung One UI; Xiaomi HyperOS.

States: foreground · background · swiped from recents · Doze (`adb shell dumpsys deviceidle
force-idle`) · locked · DND · silent. Force-stopped means no delivery; that's documented Android
behavior.

Scenarios:
- answer/decline from the lock screen, from heads-up and from a BT headset;
- caller cancels while ringing;
- answered on the user's web tab (FR-CALL-09);
- Wi-Fi↔LTE switch mid-call;
- GSM call mid-call;
- 30 min call with the screen off;
- busy;
- reply/read from the shade;
- read on the PC → notification gone;
- offline start;
- update banner.

## Out of scope

iOS (separate ADR), group calls, Google Play, UnifiedPush/no-Google transport, native LiveKit
media, a custom ringtone, the conversations shortcut section, self-installing APK updates.
