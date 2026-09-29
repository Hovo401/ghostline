import { useEffect } from "react";

/**
 * Wraps the native `beforeunload` confirmation prompt, active only while
 * `active` is true — `routes/app.tsx` gates this on whether
 * `upload-queue-store` has any in-flight upload, so closing the tab mid
 * upload warns instead of silently losing it.
 */
export function useBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      // The spec-compliant way to trigger the browser's generic "leave
      // site?" prompt — every browser shows its own fixed text regardless,
      // so there's no message to customize (the legacy `returnValue`-string
      // approach is deprecated).
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active]);
}
