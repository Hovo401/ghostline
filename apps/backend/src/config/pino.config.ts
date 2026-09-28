import { LoggerModule } from "nestjs-pino";
import type { Params } from "nestjs-pino";

import { AppConfigService } from "./app-config.service";

/** Shared by the HTTP app and the worker entrypoint — see app.module.ts / worker.module.ts. */
export function createPinoParams(config: AppConfigService): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      transport: config.isProduction ? undefined : { target: "pino-pretty" },
    },
  };
}

/**
 * `AppConfigModule` is `@Global()` (see config.module.ts), so `AppConfigService`
 * is available here without an explicit `imports` entry — same as every other
 * module that injects it. Shared by both entrypoints instead of being
 * duplicated in app.module.ts and worker.module.ts.
 */
export const PinoLoggerModule = LoggerModule.forRootAsync({
  inject: [AppConfigService],
  useFactory: createPinoParams,
});
