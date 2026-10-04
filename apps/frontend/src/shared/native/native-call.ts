import {
  Ghostline,
  hasGhostlinePlugin,
  type NativeAudioRoute,
  type NativeAudioRoutes,
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

/** The audio routes right now; `null` outside the app or in an APK older than T-087 (no route picker). */
export async function getNativeAudioRoutes(): Promise<NativeAudioRoutes | null> {
  if (!hasGhostlinePlugin()) return null;
  try {
    return await Ghostline.getAudioRoutes();
  } catch {
    return null;
  }
}

/** Switches the call's sound; `false` when it didn't happen (old APK, route gone). */
export async function setNativeAudioRoute(route: NativeAudioRoute): Promise<boolean> {
  if (!hasGhostlinePlugin()) return false;
  try {
    await Ghostline.setAudioRoute({ route });
    return true;
  } catch {
    return false;
  }
}

/** Route changes (a headset plugged in, a Bluetooth device gone); returns the unsubscribe. */
export function listenForNativeAudioRoutes(
  onRoutes: (routes: NativeAudioRoutes) => void,
): () => void {
  if (!hasGhostlinePlugin()) return () => undefined;
  const handle = Ghostline.addListener("audioRoutes", onRoutes).catch(() => null);
  return () => {
    void handle.then((h) => h?.remove());
  };
}

/** The call window entering/leaving picture-in-picture; returns the unsubscribe. */
export function listenForNativePipMode(onChange: (active: boolean) => void): () => void {
  if (!hasGhostlinePlugin()) return () => undefined;
  const handle = Ghostline.addListener("pipModeChanged", (e) => {
    onChange(e.active);
  }).catch(() => null);
  return () => {
    void handle.then((h) => h?.remove());
  };
}
