import { Ghostline, hasGhostlinePlugin } from "./ghostline-plugin";

/**
 * Paints the phone's status/navigation bars with the page's background (`#rrggbb`) and picks
 * dark icons for a light one. Outside the app, or in an APK without the method, the bars keep
 * the shell's default.
 */
export async function setNativeSystemBars(color: string, darkIcons: boolean): Promise<void> {
  if (!hasGhostlinePlugin()) return;
  try {
    await Ghostline.setSystemBars({ color, darkIcons });
  } catch {
    // An older APK has no such method — its bars stay dark.
  }
}
