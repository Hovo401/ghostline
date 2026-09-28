import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import Redis from "ioredis";

import { AppConfigService } from "../config/app-config.service";

import { MEDIA_QUEUE } from "./media.processor";

/**
 * Queue *registration* only — safe to import from the HTTP app (to enqueue
 * jobs, e.g. after an upload completes) and from the worker (to enqueue
 * and to process). The processor itself lives in ProcessorsModule, which
 * only WorkerModule imports — the HTTP app should never run job handlers
 * in-process.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (config: AppConfigService) => ({
        // BullMQ needs its own connection (not the shared REDIS_CLIENT) —
        // it issues blocking commands that must not compete with
        // pub/sub or cache lookups on the same connection.
        connection: new Redis(config.redisUrl, { maxRetriesPerRequest: null }),
      }),
      inject: [AppConfigService],
    }),
    BullModule.registerQueue({ name: MEDIA_QUEUE }),
  ],
  exports: [BullModule],
})
export class JobsModule {}
