import { App } from "@capacitor/app";

import { isNativeApp } from "./is-native-app";

/**
 * Wires the Android system Back button to the router's history, so the in-app Back logic (ADR-0016:
 * overlays close, a minimized call, chat → list) behaves like the browser's Back. At the root of
 * the history there is nothing to go back to: the app minimizes like Telegram instead of closing.
 * Call once at boot; a no-op outside the native app.
 */
export function listenForNativeBack(): void {
  if (!isNativeApp()) return;
  void App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.minimizeApp();
  });
}
