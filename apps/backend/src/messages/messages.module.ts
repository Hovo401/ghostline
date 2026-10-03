import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ChatsModule } from "../chats/chats.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { StorageModule } from "../storage/storage.module";
import { UsersModule } from "../users/users.module";

import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";
import { NotificationReplyController } from "./notification-reply.controller";

@Module({
  imports: [
    AuthModule,
    RealtimeModule,
    UsersModule,
    ChatsModule,
    StorageModule,
    NotificationsModule,
  ],
  controllers: [MessagesController, NotificationReplyController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
