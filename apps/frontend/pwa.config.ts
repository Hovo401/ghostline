import type { VitePWAOptions } from "vite-plugin-pwa";

/**
 * Shared between `vite.config.ts` (real dev/build) and `vitest.config.ts`
 * (so `virtual:pwa-register` resolves in tests, see
 * `entities/notification/register-service-worker.ts`) — one source of
 * truth for the plugin options, per the root CLAUDE.md's "don't duplicate
 * logic" rule.
 *
 * `injectManifest` mode, not the default `generateSW`: `src/sw.ts` is a
 * hand-written service worker (push + notificationclick, see docs/adr/0010)
 * that also precaches the built app shell so the site — and the Android
 * app, which loads it (docs/adr/0017) — starts offline.
 */
export const vitePwaOptions: Partial<VitePWAOptions> = {
  strategies: "injectManifest",
  srcDir: "src",
  filename: "sw.ts",
  injectManifest: {
    // Scripts/styles/html/icons only: fonts and emoji data stay network-first so
    // the precache isn't dozens of unused subsets; offline falls back to system fonts.
    globPatterns: ["**/*.{js,css,html,svg}"],
  },
  // "prompt", not "autoUpdate": autoUpdate reloads every open page when a new SW takes
  // over, which would drop a call on each deploy. `sw.ts` still skipWaiting()s, so the new
  // shell is simply used from the next launch.
  registerType: "prompt",
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
