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

/** `call-store`'s phases (`entities/call`) — the page reports them, native follows (ADR-0017). */
export type NativeCallPhase =
  "outgoing" | "incoming" | "connecting" | "active" | "reconnecting" | "ended";

/** What native needs to keep the call's notification and Telecom entry in step with the page. */
export interface NativeCallState {
  callId: string;
  chatId: string;
  phase: NativeCallPhase;
  video: boolean;
  peerName: string;
  /** Epoch millis the call was answered, `null` while it is still ringing/connecting. */
  answeredAt: number | null;
  muted: boolean;
  /** Incoming only (T-094): `Call.createdAt`, lets native ring the rest of the 45 s window. */
  createdAt?: string;
  callerAvatarUrl?: string | null;
}

/** A command from the phone's own UI (call screen, notification buttons) to the page. */
export type NativeCallCommand =
  | { type: "answer"; callId: string; chatId: string; video: boolean }
  /** "Перезвонить" on a missed call. */
  | { type: "callback"; chatId: string; video: boolean }
  /** "Отклонить" on a ring native started from the page's own state (no decline token). */
  | { type: "decline"; callId: string }
  | { type: "hangup" }
  | { type: "toggleMute" }
  /** The ongoing-call notification was tapped: bring the call screen up. */
  | { type: "open" }
  /** The system put the call on hold (a GSM call came in) / gave it back (T-087). */
  | { type: "hold" }
  | { type: "resume" };

/** Where the call's sound goes (T-087); `wired` covers headphones and USB headsets. */
export type NativeAudioRoute = "earpiece" | "speaker" | "bluetooth" | "wired";

export interface NativeAudioRoutes {
  /** `null` until native has settled on one. */
  current: NativeAudioRoute | null;
  /** `name` is the device's own name for Bluetooth/wired, shown in the route sheet. */
  available: { route: NativeAudioRoute; name: string }[];
}

/** The commands that can arrive before the page is up, so native holds them for `consumeLaunchAction`. */
export type NativeLaunchAction = Extract<NativeCallCommand, { type: "answer" | "callback" }>;

/**
 * The `Ghostline` plugin of `apps/mobile/android` (ADR-0017). Methods marked "newer" arrived with
 * T-084 or later; an older APK rejects them with `UNIMPLEMENTED` (see `native-permissions.ts`,
 * `native-call.ts`).
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
  /** Newer (T-086). `null` means no call: native drops the ongoing notification and the Telecom entry. */
  setCallState(options: { state: NativeCallState | null }): Promise<void>;
  /**
   * Newer (T-086). The answer/callback the user chose while the page was not running, once; `null` when
   * there is none or it is older than a minute.
   */
  consumeLaunchAction(): Promise<{ action: NativeLaunchAction | null }>;
  /** Newer (T-087). The routes right now; later changes arrive as `audioRoutes`. */
  getAudioRoutes(): Promise<NativeAudioRoutes>;
  /** Newer (T-087). Rejects with `UNAVAILABLE` when that route is not connected. */
  setAudioRoute(options: { route: NativeAudioRoute }): Promise<void>;
  /**
   * Newer (T-087). The "Продолжить" button on a held call: asks the phone to take the call off hold;
   * native then sends the `resume` command. Rejects with `UNAVAILABLE` when no call is on hold.
   */
  resumeCall(): Promise<void>;
  checkPermissions(): Promise<{ notifications: PermissionState }>;
  requestPermissions(): Promise<{ notifications: PermissionState }>;
  addListener(
    event: "pushTokenChanged",
    listener: (event: { token: string }) => void,
  ): Promise<PluginListenerHandle>;
  /** Newer (T-086). */
  addListener(
    event: "callCommand",
    listener: (command: NativeCallCommand) => void,
  ): Promise<PluginListenerHandle>;
  /** Newer (T-087). */
  addListener(
    event: "audioRoutes",
    listener: (routes: NativeAudioRoutes) => void,
  ): Promise<PluginListenerHandle>;
  /** Newer (T-088). The call window went into / out of picture-in-picture. */
  addListener(
    event: "pipModeChanged",
    listener: (event: { active: boolean }) => void,
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
