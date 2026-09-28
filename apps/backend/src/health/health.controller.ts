import { Controller, Get, Inject } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  PrismaHealthIndicator,
  type HealthIndicatorResult,
} from "@nestjs/terminus";
import type Redis from "ioredis";

import { PrismaService } from "../prisma/prisma.service";
import { REDIS_CLIENT } from "../redis/redis.module";
import { StorageService } from "../storage/storage.service";

const CHECK_TIMEOUT_MS = 2000;

/**
 * `/health` and `/ready` back the `nginx`/orchestrator healthchecks and the
 * Docker Compose `depends_on: condition: service_healthy` chain — see
 * docs/REQUIREMENTS.md §6.8. Both routes run the same three checks
 * (database, redis, object storage); `/health` is for "is the process
 * alive", `/ready` for "can it serve traffic" — identical today, kept as
 * two routes so they can diverge later without a breaking change.
 */
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get("health")
  @HealthCheck()
  check() {
    return this.runChecks();
  }

  @Get("ready")
  @HealthCheck()
  ready() {
    return this.runChecks();
  }

  private runChecks() {
    return this.health.check([
      () => this.prismaHealth.pingCheck("database", this.prisma, { timeout: CHECK_TIMEOUT_MS }),
      () => this.pingCheck("redis", () => this.redis.ping()),
      () => this.pingCheck("storage", () => this.storage.checkBucket()),
    ]);
  }

  /**
   * `HealthIndicatorService#check(key)` only gives `.up()`/`.down()` in
   * this Terminus version (no `.attempt()`/`.withTimeout()` builder yet) —
   * this is that pattern, shared by every check here that isn't
   * `PrismaHealthIndicator` (which has its own timeout option built in).
   */
  private async pingCheck<Key extends string>(
    key: Key,
    fn: () => Promise<unknown>,
  ): Promise<HealthIndicatorResult<Key>> {
    const indicator = this.indicators.check(key);
    try {
      await withTimeout(fn(), CHECK_TIMEOUT_MS);
      return indicator.up();
    } catch (error) {
      return indicator.down(error instanceof Error ? error.message : "check failed");
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(`timed out after ${String(ms)}ms`));
      }, ms);
    }),
  ]);
}
