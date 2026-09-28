import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import { AppConfigService } from "./config/app-config.service";
import { AppConfigModule } from "./config/config.module";
import { createPinoParams } from "./config/pino.config";
import { ProcessorsModule } from "./jobs/processors.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { StorageModule } from "./storage/storage.module";

/**
 * Entry module for the `worker` container (main.worker.ts) — BullMQ job
 * processing only. No HealthModule/RealtimeModule here: those bind to an
 * HTTP server and Socket.IO, neither of which exists in this process (the
 * worker runs the same image as the backend with a different command and
 * no exposed port — see compose.dev.yaml / compose.prod.yaml).
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: createPinoParams,
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    ProcessorsModule,
  ],
})
export class WorkerModule {}
