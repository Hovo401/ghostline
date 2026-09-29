import { useEffect } from "react";

/**
 * Screen Wake Lock for the duration of an active call (calls plan §Фаза 3)
 * — feature-detected via `"wakeLock" in navigator` (TypeScript's DOM lib
 * types `Navigator.wakeLock` as always present, which doesn't hold on every
 * supported target, hence the `in` check instead of relying on the type),
 * released on unmount or as soon as `active` flips false. The OS revokes the
 * lock whenever the tab is hidden regardless of call state, so this
 * re-acquires on `visibilitychange` back to visible.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (!("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async (): Promise<void> => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Not fatal — the call keeps running regardless (denied by a
        // low-power mode, or the tab already isn't visible).
      }
    };
    void acquire();

    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible" && !cancelled) void acquire();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
