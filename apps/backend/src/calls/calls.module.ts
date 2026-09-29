import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { MessagesModule } from "../messages/messages.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { UsersModule } from "../users/users.module";

import { CallsController } from "./calls.controller";
import { CallsService } from "./calls.service";

@Module({
  imports: [
    AuthModule,
    RealtimeModule,
    UsersModule,
    MessagesModule,
    NotificationsModule,
    JobsModule,
  ],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
