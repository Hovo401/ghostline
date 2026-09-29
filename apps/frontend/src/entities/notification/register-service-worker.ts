import { registerSW } from "virtual:pwa-register";

let registered = false;

/**
 * Registers `src/sw.ts` (built by `vite-plugin-pwa`'s `injectManifest` mode
 * — see `vite.config.ts`) once per page load. Call from the app's bootstrap
 * (`app/main.tsx`) rather than at module import time, so importing this
 * module in a test doesn't register a real service worker as a side effect.
 *
 * `immediate: true` activates a waiting worker without prompting the user —
 * this app has no offline asset cache that could go stale (`injectManifest`
 * mode without a precache list, just the push handlers), so there's nothing
 * a new SW version could break by taking over right away.
 */
export function registerServiceWorker(): void {
  if (registered) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  registered = true;
  registerSW({ immediate: true });
}
