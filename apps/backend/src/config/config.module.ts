import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";

import { AppConfigService } from "./app-config.service";
import { validateEnv } from "./env.schema";

/**
 * Global on purpose, same rationale as PrismaModule: every module in the
 * app needs `AppConfigService` (hard rule 8 — nothing outside
 * env.schema.ts reads `process.env` directly), it has no per-module state,
 * and requiring `imports: [AppConfigModule]` everywhere that injects it
 * (LoggerModule's async factory, PrismaService, StorageService, RedisModule,
 * JobsModule's BullModule.forRootAsync, …) would just be repeated
 * boilerplate for no safety benefit.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
