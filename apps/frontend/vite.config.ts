import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // tanstackRouter must come before react() — see its Vite plugin docs.
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Reached through nginx (docker/nginx/dev.conf) at http://localhost/ —
    // the HMR websocket rides the same proxied origin.
    hmr: { clientPort: 80 },
  },
});
