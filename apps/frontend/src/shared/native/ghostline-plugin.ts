import {
  Capacitor,
  registerPlugin,
  type PermissionState,
  type PluginListenerHandle,
} from "@capacitor/core";

import { isNativeApp } from "./is-native-app";

export interface PushRegistration {
  /** FCM registration token. */
  token: string;
  /** Base64 of the device's own AES-256 key — the backend encrypts every push with it. */
  deviceKey: string;
  /** Stable per install. */
  deviceId: string;
}

/** The `Ghostline` plugin of `apps/mobile/android` (ADR-0017). */
export interface GhostlinePlugin {
  /** Rejects with code `UNAVAILABLE` in a build without `google-services.json`. */
  getPushRegistration(): Promise<PushRegistration>;
  checkPermissions(): Promise<{ notifications: PermissionState }>;
  requestPermissions(): Promise<{ notifications: PermissionState }>;
  addListener(
    event: "pushTokenChanged",
    listener: (event: { token: string }) => void,
  ): Promise<PluginListenerHandle>;
}

export const Ghostline = registerPlugin<GhostlinePlugin>("Ghostline");

/**
 * Inside the app *and* the installed APK already ships the plugin — an older shell without it
 * must keep working against this newer site, so every use is guarded by this.
 */
export function hasGhostlinePlugin(): boolean {
  return isNativeApp() && Capacitor.isPluginAvailable("Ghostline");
}
