import { RegisterNativeDeviceBodySchema } from "@ghostline/contracts";
import { useEffect } from "react";

import { apiFetch } from "../../shared/api/http-client";
import { Ghostline, getInstalledBuild, hasGhostlinePlugin } from "../../shared/native";

let registeredDeviceId: string | null = null;
/** Several components mount the push hooks at once — register once per page load. */
let syncOnce: Promise<boolean> | null = null;

async function register(): Promise<void> {
  const [registration, appVersionCode] = await Promise.all([
    Ghostline.getPushRegistration(),
    getInstalledBuild(),
  ]);
  const body = RegisterNativeDeviceBodySchema.parse({
    deviceId: registration.deviceId,
    fcmToken: registration.token,
    deviceKey: registration.deviceKey,
    appVersionCode,
    platform: "android",
  });
  // An upsert by deviceId, so repeating it (token rotation, re-login) is harmless.
  await apiFetch("/notifications/native-devices", { method: "POST", body });
  registeredDeviceId = registration.deviceId;
}

/** Whether this install is now registered with the server — never rejects. */
export function syncNativeDevice(): Promise<boolean> {
  syncOnce ??= register().then(
    () => true,
    (error: unknown) => {
      syncOnce = null;
      console.error("native push registration failed", error);
      return false;
    },
  );
  return syncOnce;
}

/** Registers again with the current token — after a rotation, or a retry from «Включить». */
export function resyncNativeDevice(): Promise<boolean> {
  syncOnce = null;
  return syncNativeDevice();
}

/**
 * Drops this install's server row while the session is still valid (logout, FR-NOTIF-04) — a
 * signed-out phone must stop receiving the account's pushes. A no-op outside the app.
 */
export async function unregisterNativeDevice(): Promise<void> {
  if (!hasGhostlinePlugin()) return;
  await syncOnce;
  if (!registeredDeviceId) return;
  await apiFetch(`/notifications/native-devices/${registeredDeviceId}`, { method: "DELETE" });
  registeredDeviceId = null;
  syncOnce = null;
}

/** Test-only: forget the per-page-load registration. */
export function resetNativeRegistrationForTests(): void {
  registeredDeviceId = null;
  syncOnce = null;
}

/**
 * Keeps the signed-in app install registered for native push: once on mount and again whenever
 * FCM rotates the token. Mounted by `useMessengerSession`; inert outside the app.
 */
export function useNativePushRegistration(): void {
  useEffect(() => {
    if (!hasGhostlinePlugin()) return;
    void syncNativeDevice();

    let cancelled = false;
    let remove: (() => Promise<void>) | undefined;
    void Ghostline.addListener("pushTokenChanged", () => {
      void resyncNativeDevice();
    }).then((handle) => {
      if (cancelled) void handle.remove();
      else remove = handle.remove;
    });
    return () => {
      cancelled = true;
      void remove?.();
    };
  }, []);
}
