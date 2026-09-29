import path from "node:path";

import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

import { vitePwaOptions } from "./pwa.config";

export default defineConfig({
  // VitePWA is here (not just vite.config.ts) so tests importing
  // `entities/notification/register-service-worker.ts` can resolve its
  // `virtual:pwa-register` import — see pwa.config.ts.
  plugins: [react(), VitePWA(vitePwaOptions)],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/shared/test/setup.ts"],
    css: true,
  },
});
