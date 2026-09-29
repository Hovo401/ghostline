import type { VitePWAOptions } from "vite-plugin-pwa";

/**
 * Shared between `vite.config.ts` (real dev/build) and `vitest.config.ts`
 * (so `virtual:pwa-register` resolves in tests, see
 * `entities/notification/register-service-worker.ts`) — one source of
 * truth for the plugin options, per the root CLAUDE.md's "don't duplicate
 * logic" rule.
 *
 * `injectManifest` mode, not the default `generateSW`: `src/sw.ts` is a
 * hand-written service worker (push + notificationclick only, see
 * docs/adr/0010) with no offline asset cache to precache, so
 * `injectionPoint: undefined` skips Workbox's `self.__WB_MANIFEST`
 * requirement entirely instead of injecting an unused precache list.
 */
export const vitePwaOptions: Partial<VitePWAOptions> = {
  strategies: "injectManifest",
  srcDir: "src",
  filename: "sw.ts",
  injectManifest: {
    injectionPoint: undefined,
  },
  registerType: "autoUpdate",
  manifest: {
    name: "Ghostline",
    short_name: "Ghostline",
    description: "Веб-мессенджер без номера телефона",
    start_url: "/app",
    display: "standalone",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  },
  // Enabled (unlike vite-plugin-pwa's default) so `sw.ts` actually registers
  // under `pnpm dev` — otherwise `navigator.serviceWorker.ready` never
  // resolves and `use-push-subscription.ts` hangs at "pending" forever, with
  // nothing visible in NotificationsTab to click. `type: "module"` matches
  // `injectManifest`'s ESM output (no Workbox precache, see the docblock
  // above) so dev serves the same module format as the real build.
  devOptions: {
    enabled: true,
    type: "module",
  },
};
