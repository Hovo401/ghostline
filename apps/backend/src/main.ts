import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import type Redis from "ioredis";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { AppConfigService } from "./config/app-config.service";
import { RedisIoAdapter } from "./realtime/redis-io.adapter";
import { REDIS_CLIENT } from "./redis/redis.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(AppConfigService);
  app.setGlobalPrefix("api/v1", { exclude: ["health", "ready"] });
  app.use(helmet());
  app.enableCors({ origin: config.corsOrigin, credentials: true });
  app.useWebSocketAdapter(new RedisIoAdapter(app, app.get<Redis>(REDIS_CLIENT)));

  await app.listen(config.port);
}

void bootstrap();
