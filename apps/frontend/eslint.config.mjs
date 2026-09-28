import { createFrontendConfig } from "@ghostline/config/eslint.frontend";

export default [
  { ignores: ["src/routeTree.gen.ts"] },
  ...createFrontendConfig(import.meta.dirname),
];
