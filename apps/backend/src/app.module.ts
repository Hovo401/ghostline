import { Module } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";

import { AttachmentsModule } from "./attachments/attachments.module";
import { AuthModule } from "./auth/auth.module";
import { CallsModule } from "./calls/calls.module";
import { ChatsModule } from "./chats/chats.module";
import { AppConfigModule } from "./config/config.module";
import { PinoLoggerModule } from "./config/pino.config";
import { HealthModule } from "./health/health.module";
import { JobsModule } from "./jobs/jobs.module";
import { MessagesModule } from "./messages/messages.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { RedisModule } from "./redis/redis.module";
import { StorageModule } from "./storage/storage.module";
import { UsersModule } from "./users/users.module";

/** Entry module for the HTTP + WebSocket process (main.ts). */
@Module({
  imports: [
    AppConfigModule,
    PinoLoggerModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RealtimeModule,
    ChatsModule,
    MessagesModule,
    JobsModule,
    AttachmentsModule,
    NotificationsModule,
    CallsModule,
  ],
  providers: [{ provide: APP_PIPE, useClass: ZodValidationPipe }],
})
export class AppModule {}
