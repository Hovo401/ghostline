import { registerSW } from "virtual:pwa-register";

let registered = false;

/**
 * Registers `src/sw.ts` (built by `vite-plugin-pwa`'s `injectManifest` mode
 * — see `vite.config.ts`) once per page load. Call from the app's bootstrap
 * (`app/main.tsx`) rather than at module import time, so importing this
 * module in a test doesn't register a real service worker as a side effect.
 *
 * `immediate: true` registers right away; a new worker takes over on its own
 * (`sw.ts` calls `skipWaiting`) without reloading open pages
 * (`registerType: "prompt"`, see `pwa.config.ts`) — the freshly precached shell
 * is used from the next load.
 */
export function registerServiceWorker(): void {
  if (registered) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  registered = true;
  registerSW({ immediate: true });
}
