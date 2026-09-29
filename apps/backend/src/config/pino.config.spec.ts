import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Matches the valid config in env.schema.spec.ts. Stubbed via `beforeEach`
// and imported dynamically inside the test: `NestConfigModule.forRoot`'s
// `validate` runs the moment config.module.ts is loaded (decorator
// evaluation, not Nest instantiation), so a static top-level import would
// run before the env stub is in place.
const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/ghostline",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:8333",
  S3_BUCKET: "ghostline-media",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_PUBLIC_URL: "http://localhost:8333",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  LIVEKIT_URL: "wss://rtc.example.com",
  LIVEKIT_API_URL: "http://livekit:7880",
  LIVEKIT_API_KEY: "key",
  LIVEKIT_API_SECRET: "secret",
  VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
  VAPID_SUBJECT: "mailto:admin@example.com",
};

describe("PinoLoggerModule", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const [key, value] of Object.entries(validEnv)) {
      vi.stubEnv(key, value);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Regression test for the LoggerModule.forRootAsync factory failing to
  // resolve AppConfigService: its useFactory runs inside LoggerModule's own
  // scope, so AppConfigService must come from a module in the tree —
  // AppConfigModule is @Global() (config.module.ts), so importing it
  // anywhere (here, in the test) makes it available everywhere, same as in
  // app.module.ts / worker.module.ts.
  it("resolves AppConfigService for its async factory", async () => {
    const { PinoLoggerModule } = await import("./pino.config");
    const { AppConfigModule } = await import("./config.module");
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PinoLoggerModule],
    }).compile();

    expect(moduleRef.get(Logger)).toBeInstanceOf(Logger);
  });
});
