import { Module } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { ZodValidationPipe } from "nestjs-zod";

import { AppConfigService } from "./config/app-config.service";
import { AppConfigModule } from "./config/config.module";
import { createPinoParams } from "./config/pino.config";
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
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: createPinoParams,
    }),
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
