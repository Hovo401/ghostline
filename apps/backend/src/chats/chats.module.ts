import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { StorageModule } from "../storage/storage.module";
import { UsersModule } from "../users/users.module";

import { ChatsController } from "./chats.controller";
import { ChatsService } from "./chats.service";
import { NotificationReadController } from "./notification-read.controller";

@Module({
  imports: [AuthModule, NotificationsModule, RealtimeModule, UsersModule, StorageModule],
  controllers: [ChatsController, NotificationReadController],
  providers: [ChatsService],
  exports: [ChatsService],
})
export class ChatsModule {}
