import { useEffect, useState } from "react";

import {
  getNativeAudioRoutes,
  isNativeApp,
  listenForNativeAudioRoutes,
  type NativeAudioRoutes,
} from "../../shared/native";

/**
 * The phone's audio routes for the call screen (T-087) — `null` in a browser, in an APK without the
 * route picker, or while `enabled` is false, so the screen shows no route button there. Starts from
 * the current snapshot and follows native's `audioRoutes` events (a headset plugged in, a Bluetooth
 * device gone).
 */
export function useNativeAudioRoutes(enabled: boolean): NativeAudioRoutes | null {
  const [routes, setRoutes] = useState<NativeAudioRoutes | null>(null);

  useEffect(() => {
    if (!enabled || !isNativeApp()) return;
    let cancelled = false;
    let gotEvent = false;
    void getNativeAudioRoutes().then((snapshot) => {
      // An event that arrived while the snapshot was in flight is newer than it.
      if (!cancelled && !gotEvent && snapshot) setRoutes(snapshot);
    });
    const stop = listenForNativeAudioRoutes((next) => {
      gotEvent = true;
      if (!cancelled) setRoutes(next);
    });
    return () => {
      cancelled = true;
      stop();
      setRoutes(null);
    };
  }, [enabled]);

  return routes;
}
