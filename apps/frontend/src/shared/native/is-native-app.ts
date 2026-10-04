import { Capacitor } from "@capacitor/core";

/**
 * Whether the page runs inside the Android app (Capacitor shell, ADR-0017) rather than a browser.
 * Every native call is guarded by this: the live site must keep working in a plain browser and
 * in an older shell whose plugin API lacks a newer method.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
