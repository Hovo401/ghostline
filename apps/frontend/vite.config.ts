import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { vitePwaOptions } from "./pwa.config";

export default defineConfig({
  // tanstackRouter must come before react() — see its Vite plugin docs.
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA(vitePwaOptions),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  optimizeDeps: {
    // Same symlink issue as `build.commonjsOptions.include` below, but for
    // the dev server: without this, Vite serves @ghostline/contracts'
    // built CJS straight off disk via `/@fs/` instead of pre-bundling it
    // through esbuild's CJS->ESM conversion, so named imports 404 at runtime.
    include: ["@ghostline/contracts"],
  },
  build: {
    commonjsOptions: {
      // pnpm workspace deps are symlinks; Vite/Rollup resolve them to their
      // real path (outside any node_modules dir) before the commonjs plugin's
      // default `/node_modules/` include pattern is tested against it, so a
      // workspace package built as CJS (like @ghostline/contracts) is never
      // converted and its named exports don't statically resolve.
      include: [/packages\/contracts/, /node_modules/],
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Reached through nginx (docker/nginx/dev.conf) at http://localhost/ or
    // https://<LAN_IP>/ (docs/adr/0009's LAN-dev addendum) — no `clientPort`
    // override here: with none set, Vite's HMR client falls back to
    // `location.port` (empty on both of those, since 80/443 are the
    // protocol's default ports), so it always matches whichever origin/port
    // the page itself was actually loaded through instead of being pinned
    // to plain :80 and breaking HMR on the https:// origin.
  },
});
