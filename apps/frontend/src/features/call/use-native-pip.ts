import { useEffect, useState } from "react";

import { listenForNativePipMode } from "../../shared/native";

/** True while the Android shell shows the app in a picture-in-picture window
 * (T-088). Always false in a browser and in an APK that predates the PiP
 * bridge — `listenForNativePipMode` is a no-op there. */
export function useNativePip(): boolean {
  const [pip, setPip] = useState(false);
  useEffect(() => listenForNativePipMode(setPip), []);
  return pip;
}
