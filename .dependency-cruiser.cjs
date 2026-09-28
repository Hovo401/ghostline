/**
 * Backend architecture guardrail (frontend layering is covered by
 * eslint-plugin-boundaries instead — see packages/config/eslint.frontend.mjs).
 * Run via `pnpm depcruise` / `pnpm check:repo`.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "A circular dependency between backend modules usually means a shared concern needs its own module instead of two modules reaching into each other.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment:
        "Unreferenced file — dead code (knip covers this project-wide; this catches it early for files under src/).",
      from: { orphan: true, pathNot: ["\\.spec\\.ts$", "main(\\.worker)?\\.ts$"] },
      to: {},
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
