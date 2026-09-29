import { Module } from "@nestjs/common";

import { RealtimeEmitter } from "../realtime/realtime-emitter";
import { StorageModule } from "../storage/storage.module";

import { CallRingTimeoutProcessor } from "./calls.processor";
import { JobsModule } from "./jobs.module";
import { MediaProcessor } from "./media.processor";
import { NotificationsProcessor } from "./notifications.processor";

/** Imported only by WorkerModule — see worker.module.ts. */
@Module({
  imports: [JobsModule, StorageModule],
  providers: [MediaProcessor, CallRingTimeoutProcessor, NotificationsProcessor, RealtimeEmitter],
})
export class ProcessorsModule {}
