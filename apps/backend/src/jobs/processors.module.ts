import { Module } from "@nestjs/common";

import { JobsModule } from "./jobs.module";
import { MediaProcessor } from "./media.processor";

/** Imported only by WorkerModule — see worker.module.ts. */
@Module({
  imports: [JobsModule],
  providers: [MediaProcessor],
})
export class ProcessorsModule {}
