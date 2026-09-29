import { createFrontendConfig } from "@ghostline/config/eslint.frontend";

export default [
  { ignores: ["src/routeTree.gen.ts"] },
  ...createFrontendConfig(import.meta.dirname),
  {
    // `virtual:pwa-register` is injected by vite-plugin-pwa at build time —
    // no resolver can see a real module for it.
    rules: { "import-x/no-unresolved": ["error", { ignore: ["^virtual:"] }] },
  },
];
