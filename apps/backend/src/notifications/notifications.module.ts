import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { StorageModule } from "../storage/storage.module";

import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [AuthModule, JobsModule, StorageModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
