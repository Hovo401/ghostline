// Shared ESLint base config. App-level `eslint.config.mjs` calls
// `createBaseConfig(import.meta.dirname)` and spreads the result.
import js from "@eslint/js";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { importX } from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

/** @param {string} tsconfigRootDir */
export function createBaseConfig(tsconfigRootDir) {
  return tseslint.config(
    {
      ignores: ["dist/**", "build/**", "coverage/**", "**/*.d.ts", "node_modules/**", ".turbo/**"],
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    importX.flatConfigs.recommended,
    importX.flatConfigs.typescript,
    prettierConfig,
    {
      settings: {
        "import-x/resolver-next": [createTypeScriptImportResolver()],
      },
      languageOptions: {
        parserOptions: {
          projectService: {
            // Config files at a package's root (eslint.config.mjs itself,
            // vite/vitest configs, …) generally aren't part of that
            // package's own tsconfig `include` — lint them with a
            // lightweight default program instead of erroring.
            allowDefaultProject: [
              "*.mjs",
              "*.cjs",
              "*.config.ts",
              "*.config.mts",
              "prisma.config.ts",
              // apps/frontend's service worker: it runs in a WebWorker
              // scope, not the page's DOM, so it's excluded from
              // tsconfig.json's `include` and built separately with
              // tsconfig.sw.json (see that file, and apps/frontend/CLAUDE.md)
              // — `projectService` only auto-discovers files named
              // `tsconfig.json`, so it can't pick that one up on its own.
              "src/sw.ts",
              "src/sw-notifications.ts",
              "src/sw-notifications.spec.ts",
            ],
          },
          tsconfigRootDir,
        },
      },
      rules: {
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/consistent-type-imports": "error",
        "@typescript-eslint/no-explicit-any": "error",
        "import-x/order": [
          "error",
          {
            "newlines-between": "always",
            alphabetize: { order: "asc", caseInsensitive: true },
          },
        ],
        "import-x/no-cycle": "error",
        "import-x/no-self-import": "error",
        "no-restricted-syntax": [
          "error",
          {
            selector: "TSEnumDeclaration",
            message:
              "Use a const object (`as const`) or a zod enum instead of `enum` — see packages/contracts for the pattern.",
          },
        ],
      },
    },
    {
      // Config files run under the "allowDefaultProject" lightweight
      // program above (no real tsconfig type info), so typed rules give
      // false positives here — same files that list matches.
      files: ["**/*.config.mjs", "**/*.config.cjs", "**/*.config.ts", "eslint.config.mjs"],
      extends: [tseslint.configs.disableTypeChecked],
    },
  );
}
