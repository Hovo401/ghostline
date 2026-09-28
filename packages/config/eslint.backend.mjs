// Backend ESLint config: base rules + NestJS conventions.
// Architectural layering for the backend is enforced by dependency-cruiser
// (see .dependency-cruiser.cjs), not ESLint — Nest's DI graph doesn't map
// cleanly onto file-path based boundary rules.
import { createBaseConfig } from "./eslint.base.mjs";

/** @param {string} tsconfigRootDir */
export function createBackendConfig(tsconfigRootDir) {
  return [
    ...createBaseConfig(tsconfigRootDir),
    {
      rules: {
        // Nest decorators + DI make classes without a public API surface
        // the norm (controllers, providers) — okay to allow empty classes
        // extending a base (e.g. custom exceptions).
        "@typescript-eslint/no-extraneous-class": "off",
        // Nest relies on parameter property injection (`constructor(private readonly x: X)`).
        "@typescript-eslint/parameter-properties": "off",
      },
    },
    {
      files: ["**/*.spec.ts", "**/*.e2e-spec.ts", "test/**/*.ts"],
      rules: {
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
      },
    },
  ];
}
