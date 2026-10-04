import { useQuery } from "@tanstack/react-query";

import {
  Ghostline,
  hasGhostlinePlugin,
  type NativePermissionStatus,
  type SystemSettingsKind,
} from "./ghostline-plugin";

/**
 * The phone's call-readiness settings, or `null` outside the app and in an APK older than T-084
 * (the site is newer than the installed shell: its plugin rejects the method as `UNIMPLEMENTED`).
 */
export async function getNativePermissionStatus(): Promise<NativePermissionStatus | null> {
  if (!hasGhostlinePlugin()) return null;
  try {
    return await Ghostline.getPermissionStatus();
  } catch {
    return null;
  }
}

/** Opens the Android screen for one checklist row; `false` if this phone has none. */
export async function openSystemSettings(kind: SystemSettingsKind): Promise<boolean> {
  try {
    await Ghostline.openSystemSettings({ kind });
    return true;
  } catch {
    return false;
  }
}

/** Logout: a signed-out phone must not keep this account's texts in the shade. Old APK: no-op. */
export async function clearNativeNotifications(): Promise<void> {
  if (!hasGhostlinePlugin()) return;
  try {
    await Ghostline.clearNotifications();
  } catch {
    // An APK without the method has no history to clear.
  }
}

export const NATIVE_PERMISSIONS_KEY = ["native-permissions"] as const;

/**
 * `undefined` while loading, `null` when there is no checklist to show (browser, old APK). Refetches
 * when the page regains focus — the user comes back from Android's settings screen with a new answer.
 */
export function useNativePermissions(): NativePermissionStatus | null | undefined {
  const { data } = useQuery({
    queryKey: NATIVE_PERMISSIONS_KEY,
    queryFn: getNativePermissionStatus,
    refetchOnWindowFocus: "always",
    staleTime: 0,
  });
  return data;
}
