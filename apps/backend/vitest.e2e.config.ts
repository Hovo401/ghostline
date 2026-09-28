import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * Needs Postgres/Redis/SeaweedFS reachable at the URLs in the environment
 * (i.e. run against `compose.dev.yaml`'s infra, or CI's service
 * containers) — these hit real services on purpose, they are not unit
 * tests with mocks.
 */
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    environment: "node",
    include: ["test/**/*.e2e-spec.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
