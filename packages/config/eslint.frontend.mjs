// Frontend ESLint config: base rules + React + design-token enforcement
// + layered-architecture boundaries (shared < entities < features < routes < app).
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import boundaries from "eslint-plugin-boundaries";
import { createBaseConfig } from "./eslint.base.mjs";

const HEX_COLOR_LITERAL =
  "Literal[value=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]";

/** @param {string} tsconfigRootDir */
export function createFrontendConfig(tsconfigRootDir) {
  return [
    ...createBaseConfig(tsconfigRootDir),
    reactHooks.configs["recommended-latest"],
    reactRefresh.configs.vite,
    {
      plugins: { boundaries },
      settings: {
        "boundaries/elements": [
          { type: "app", pattern: "src/app/*", mode: "folder" },
          { type: "routes", pattern: "src/routes/*", mode: "folder" },
          { type: "features", pattern: "src/features/*", mode: "folder" },
          { type: "entities", pattern: "src/entities/*", mode: "folder" },
          { type: "shared", pattern: "src/shared/*", mode: "folder" },
          { type: "themes", pattern: "src/themes/*", mode: "folder" },
        ],
      },
      rules: {
        ...boundaries.configs.recommended.rules,
        "boundaries/element-types": [
          "error",
          {
            default: "disallow",
            rules: [
              { from: "app", allow: ["routes", "features", "entities", "shared", "themes"] },
              { from: "routes", allow: ["features", "entities", "shared", "themes"] },
              { from: "features", allow: ["entities", "shared", "themes"] },
              { from: "entities", allow: ["shared", "themes"] },
              { from: "shared", allow: ["shared", "themes"] },
              { from: "themes", allow: ["shared"] },
            ],
          },
        ],
        // Design tokens only — no ad-hoc hex colors in component code.
        // Colors live in shared/theme token files; see DESIGN-BRIEF §8.
        "no-restricted-syntax": [
          "error",
          {
            selector: "TSEnumDeclaration",
            message: "Use a const object (`as const`) or a zod enum instead of `enum`.",
          },
          {
            selector: HEX_COLOR_LITERAL,
            message:
              "No hex color literals in components — use a theme token from shared/theme (see DESIGN-BRIEF §2/§8).",
          },
        ],
      },
    },
    {
      // Theme token definitions are the one place allowed to declare raw
      // color literals — everything else must consume them. This also
      // covers shared/theme's runtime pieces (the `custom` theme/accent
      // generator, its color math, and their tests), which do the same job
      // as a themes/*.css file but for the one axis that can't be a static
      // file, and the ghost-field WebGL scene, whose default uniforms and
      // canvas-atlas draw colors aren't design tokens at all (they're
      // overwritten from CSS custom properties at runtime — see
      // readColors()) — see DESIGN-BRIEF §8.2/§8.3, §6.2.
      files: [
        "src/themes/**/*.ts",
        "src/shared/theme/**/*.ts",
        "src/shared/ui/ghost-field/ghost-field-element.ts",
      ],
      rules: { "no-restricted-syntax": "off" },
    },
    {
      // The PWA manifest's `theme_color`/`background_color` are OS-level
      // metadata (browser chrome, splash screen) baked into a static JSON
      // manifest at build time — there's no CSS custom property to read at
      // that point, so, like the theme token files above, this is a
      // legitimate place for a literal.
      files: ["pwa.config.ts"],
      rules: { "no-restricted-syntax": "off" },
    },
    {
      // The bootstrap entry isn't hot-reloaded as a component itself —
      // react-refresh's "only export components" constraint doesn't apply.
      files: ["src/app/**"],
      rules: { "react-refresh/only-export-components": "off" },
    },
  ];
}
