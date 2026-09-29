// Run via `pnpm gen <generator>`. Templates live in ./templates.
//
// Why generators at all: a new backend module / frontend feature / entity
// / contract / theme always needs the same handful of files in the same
// shape. Generating them means that shape can't drift file to file, and
// it's cheaper (in tokens, in review time) than writing each by hand —
// see docs/CLAUDE.md's "prefer a generator over hand-written boilerplate".

import { fileURLToPath } from "node:url";

const TEMPLATES = new URL("./templates/", import.meta.url);
const templatePath = (relative) => fileURLToPath(new URL(relative, TEMPLATES));

/** @param {import('plop').NodePlopAPI} plop */
export default function (plop) {
  plop.setGenerator("backend-module", {
    description: "New NestJS module under apps/backend/src/<name>",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Module name (kebab-case, e.g. chats):",
        validate: (v) => /^[a-z][a-z0-9-]*$/.test(v) || "kebab-case only",
      },
    ],
    actions: [
      {
        type: "add",
        path: "apps/backend/src/{{dashCase name}}/{{dashCase name}}.module.ts",
        templateFile: templatePath("backend-module/module.ts.hbs"),
      },
      {
        type: "add",
        path: "apps/backend/src/{{dashCase name}}/{{dashCase name}}.service.ts",
        templateFile: templatePath("backend-module/service.ts.hbs"),
      },
      {
        type: "add",
        path: "apps/backend/src/{{dashCase name}}/{{dashCase name}}.service.spec.ts",
        templateFile: templatePath("backend-module/service.spec.ts.hbs"),
      },
      {
        type: "add",
        path: "apps/backend/src/{{dashCase name}}/{{dashCase name}}.controller.ts",
        templateFile: templatePath("backend-module/controller.ts.hbs"),
      },
      (answers) =>
        `Next: import ${plop.getHelper("pascalCase")(answers.name)}Module into ` +
        `apps/backend/src/app.module.ts (and worker.module.ts too if it needs job processing).`,
    ],
  });

  plop.setGenerator("frontend-feature", {
    description: "New feature under apps/frontend/src/features/<name>",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Feature name (kebab-case, e.g. chat-list):",
        validate: (v) => /^[a-z][a-z0-9-]*$/.test(v) || "kebab-case only",
      },
    ],
    actions: [
      {
        type: "add",
        path: "apps/frontend/src/features/{{dashCase name}}/index.ts",
        templateFile: templatePath("frontend-feature/index.ts.hbs"),
      },
      {
        type: "add",
        path: "apps/frontend/src/features/{{dashCase name}}/{{pascalCase name}}.tsx",
        templateFile: templatePath("frontend-feature/Component.tsx.hbs"),
      },
      {
        type: "add",
        path: "apps/frontend/src/features/{{dashCase name}}/{{pascalCase name}}.spec.tsx",
        templateFile: templatePath("frontend-feature/Component.spec.tsx.hbs"),
      },
    ],
  });

  plop.setGenerator("entity", {
    description: "New entity under apps/frontend/src/entities/<name>",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Entity name (kebab-case, singular, e.g. chat):",
        validate: (v) => /^[a-z][a-z0-9-]*$/.test(v) || "kebab-case only",
      },
    ],
    actions: [
      {
        type: "add",
        path: "apps/frontend/src/entities/{{dashCase name}}/index.ts",
        templateFile: templatePath("entity/index.ts.hbs"),
      },
      {
        type: "add",
        path: "apps/frontend/src/entities/{{dashCase name}}/{{dashCase name}}.types.ts",
        templateFile: templatePath("entity/types.ts.hbs"),
      },
      {
        type: "add",
        path: "apps/frontend/src/entities/{{dashCase name}}/use-{{dashCase name}}.ts",
        templateFile: templatePath("entity/use-entity.ts.hbs"),
      },
    ],
  });

  plop.setGenerator("contract", {
    description: "New zod schema under packages/contracts/src/<name>, exported from index.ts",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Contract domain name (kebab-case, e.g. chat):",
        validate: (v) => /^[a-z][a-z0-9-]*$/.test(v) || "kebab-case only",
      },
    ],
    actions: [
      {
        type: "add",
        path: "packages/contracts/src/{{dashCase name}}/{{dashCase name}}.schema.ts",
        templateFile: templatePath("contract/schema.ts.hbs"),
      },
      {
        type: "append",
        path: "packages/contracts/src/index.ts",
        pattern: /$/,
        template: 'export * from "./{{dashCase name}}/{{dashCase name}}.schema";',
      },
    ],
  });

  plop.setGenerator("theme", {
    description: "New theme token file under apps/frontend/src/themes/<id>.css",
    prompts: [
      {
        type: "input",
        name: "id",
        message: "Theme id (kebab-case, e.g. midnight):",
        validate: (v) => /^[a-z][a-z0-9-]*$/.test(v) || "kebab-case only",
      },
      { type: "input", name: "label", message: "Display name (e.g. Полночь):" },
      {
        type: "list",
        name: "tone",
        message: "Tone (decides the default accent text color pairing):",
        choices: ["dark", "light"],
      },
    ],
    actions: [
      {
        type: "add",
        path: "apps/frontend/src/themes/{{dashCase id}}.css",
        templateFile: templatePath("theme/theme.css.hbs"),
      },
      {
        type: "append",
        path: "apps/frontend/src/shared/theme/theme.css",
        pattern: /(@import "\.\.\/\.\.\/themes\/[^"]+";\n)+/,
        template: '@import "../../themes/{{dashCase id}}.css";',
      },
      () =>
        "Next: add the id to ThemeId in shared/theme/appearance-store.ts's THEME_IDS, " +
        "and add its swatch to routes/dev/ui.tsx. See DESIGN-BRIEF.md §8.3.",
    ],
  });
}
