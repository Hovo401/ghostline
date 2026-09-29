import "reflect-metadata";
import "./common/bigint-json";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import type Redis from "ioredis";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { AppConfigService } from "./config/app-config.service";
import { RedisIoAdapter } from "./realtime/redis-io.adapter";
import { REDIS_CLIENT } from "./redis/redis.module";

async function bootstrap(): Promise<void> {
  // `rawBody: true` keeps the original request bytes on `req.rawBody`
  // alongside the parsed body — `CallsController`'s LiveKit webhook route
  // needs the exact bytes to verify `WebhookReceiver`'s signature.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get(AppConfigService);
  app.setGlobalPrefix("api/v1", { exclude: ["health", "ready"] });
  app.use(helmet());
  // LiveKit's webhook POSTs `application/webhook+json` (docs.livekit.io/home/server/webhooks)
  // — Nest's auto-registered JSON body parser only matches `application/json`,
  // so without this the request body (and therefore `req.rawBody`, which
  // `CallsController`'s webhook route needs to verify the signature) is
  // never populated and every delivery fails with a checksum mismatch.
  // `type` takes an array (body-parser's own option, not Nest-specific) so
  // this reconfigures the SAME json parser to match both content types —
  // calling `useBodyParser("json", { type: "application/webhook+json" })`
  // on its own would *replace* the auto-registered parser's type matcher
  // and silently stop parsing plain `application/json` requests entirely.
  app.useBodyParser("json", { type: ["application/json", "application/webhook+json"] });
  app.enableCors({ origin: config.corsOrigin, credentials: true });
  app.useWebSocketAdapter(new RedisIoAdapter(app, app.get<Redis>(REDIS_CLIENT)));

  await app.listen(config.port);
}

void bootstrap();
