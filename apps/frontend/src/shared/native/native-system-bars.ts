import { SystemBars, SystemBarsStyle } from "@capacitor/core";

import { isNativeApp } from "./is-native-app";

/**
 * The page draws under the phone's status/navigation bars (ADR-0020), so their background is the
 * page's own; only the icons need to follow the theme: dark on a light page, light on a dark one.
 */
export async function setNativeBarStyle(tone: "light" | "dark"): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await SystemBars.setStyle({
      style: tone === "light" ? SystemBarsStyle.Light : SystemBarsStyle.Dark,
    });
  } catch {
    // A shell without the plugin keeps the icons it started with.
  }
}
