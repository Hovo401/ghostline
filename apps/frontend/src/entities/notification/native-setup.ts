import type { NativePermissionStatus } from "../../shared/native";

/** Whether every row we can verify is already fine (autostart can't be read from the app). */
export function isNativeSetupComplete(status: NativePermissionStatus): boolean {
  return status.notifications && status.fullScreenCalls !== false && status.unrestrictedBattery;
}
