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

/** What the "Чтобы не пропускать звонки" checklist shows (FR-APP-07). */
export interface NativePermissionStatus {
  notifications: boolean;
  /** Absent before Android 14, where the setting doesn't exist. */
  fullScreenCalls?: boolean;
  unrestrictedBattery: boolean;
  /** The OEM whose autostart list may kill the app; `null` on stock-like firmware. */
  oem: "xiaomi" | "huawei" | "oppo" | "vivo" | "samsung" | null;
}

export type SystemSettingsKind = "notifications" | "fullScreenCalls" | "battery" | "autostart";

/**
 * The `Ghostline` plugin of `apps/mobile/android` (ADR-0017). Methods marked "newer" arrived with
 * T-084; an older APK rejects them with `UNIMPLEMENTED` (see `native-permissions.ts`).
 */
export interface GhostlinePlugin {
  /** Rejects with code `UNAVAILABLE` in a build without `google-services.json`. */
  getPushRegistration(): Promise<PushRegistration>;
  /** Newer. */
  getPermissionStatus(): Promise<NativePermissionStatus>;
  /** Newer. Rejects with `UNAVAILABLE` when the phone has no such settings screen. */
  openSystemSettings(options: { kind: SystemSettingsKind }): Promise<void>;
  /** Newer. Drops every chat notification and the text kept for it (logout). */
  clearNotifications(): Promise<void>;
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
