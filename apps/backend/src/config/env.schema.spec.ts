import { describe, expect, it } from "vitest";

import { validateEnv } from "./env.schema";

const validConfig = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/ghostline",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:8333",
  S3_BUCKET: "ghostline-media",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_PUBLIC_URL: "http://localhost:8333",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
};

describe("validateEnv", () => {
  it("accepts a complete, well-formed config and applies defaults", () => {
    const env = validateEnv(validConfig);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it("throws with a readable message when a required var is missing", () => {
    const { DATABASE_URL: _omit, ...rest } = validConfig;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("throws when a secret is shorter than the minimum length", () => {
    expect(() => validateEnv({ ...validConfig, JWT_ACCESS_SECRET: "too-short" })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });
});
