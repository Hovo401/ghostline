import {
  Ghostline,
  hasGhostlinePlugin,
  type NativeCallCommand,
  type NativeCallState,
  type NativeLaunchAction,
} from "./ghostline-plugin";

/**
 * Tells the phone about the call so its notification, Telecom entry and foreground service follow it
 * (`null` = no call). Outside the app, or in an APK older than T-086, there is nothing to tell.
 */
export async function setNativeCallState(state: NativeCallState | null): Promise<void> {
  if (!hasGhostlinePlugin()) return;
  try {
    await Ghostline.setCallState({ state });
  } catch {
    // An APK without the method has no call layer to update.
  }
}

/** The answer/callback chosen while the page was not running; `null` if none (or an old APK). */
export async function consumeNativeLaunchAction(): Promise<NativeLaunchAction | null> {
  if (!hasGhostlinePlugin()) return null;
  try {
    return (await Ghostline.consumeLaunchAction()).action;
  } catch {
    return null;
  }
}

/** Subscribes to the phone's call buttons; returns the unsubscribe. A no-op outside the app. */
export function listenForNativeCallCommands(
  onCommand: (command: NativeCallCommand) => void,
): () => void {
  if (!hasGhostlinePlugin()) return () => undefined;
  const handle = Ghostline.addListener("callCommand", onCommand).catch(() => null);
  return () => {
    void handle.then((h) => h?.remove());
  };
}
