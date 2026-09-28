import type { Params } from "nestjs-pino";

import type { AppConfigService } from "./app-config.service";

/** Shared by the HTTP app and the worker entrypoint — see app.module.ts / worker.module.ts. */
export function createPinoParams(config: AppConfigService): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      transport: config.isProduction ? undefined : { target: "pino-pretty" },
    },
  };
}
