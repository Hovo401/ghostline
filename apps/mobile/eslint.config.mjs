import { createBaseConfig } from "@ghostline/config/eslint.base";

export default [{ ignores: ["android/**", "www/**"] }, ...createBaseConfig(import.meta.dirname)];
