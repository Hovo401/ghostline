import { Global, Module } from "@nestjs/common";
import Redis from "ioredis";

import { AppConfigService } from "../config/app-config.service";

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

/**
 * One ioredis connection, shared by BullMQ (jobs), the Socket.IO redis
 * adapter (realtime), and presence lookups. Inject `REDIS_CLIENT` rather
 * than constructing a second connection — Redis connection limits are
 * cheap to hit and hard to notice until they are.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: AppConfigService) =>
        new Redis(config.redisUrl, { maxRetriesPerRequest: null }),
      inject: [AppConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
