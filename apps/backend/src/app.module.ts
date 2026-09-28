import { Module } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";

import { AppConfigModule } from "./config/config.module";
import { PinoLoggerModule } from "./config/pino.config";
import { HealthModule } from "./health/health.module";
import { JobsModule } from "./jobs/jobs.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { RedisModule } from "./redis/redis.module";
import { StorageModule } from "./storage/storage.module";

/** Entry module for the HTTP + WebSocket process (main.ts). */
@Module({
  imports: [
    AppConfigModule,
    PinoLoggerModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    HealthModule,
    RealtimeModule,
    JobsModule,
  ],
  providers: [{ provide: APP_PIPE, useClass: ZodValidationPipe }],
})
export class AppModule {}
