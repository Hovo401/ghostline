import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";

export const MEDIA_QUEUE = "media";

export interface MediaJobData {
  attachmentId: string;
}

/**
 * Reference processor — the actual pipeline (thumbnails, transcoding,
 * EXIF stripping; REQUIREMENTS.md §7.6) is implemented per attachment kind
 * once the `media` domain module exists. This establishes the queue name
 * and the `@Processor`/`WorkerHost` wiring other job types should copy.
 */
@Processor(MEDIA_QUEUE)
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  // WorkerHost.process must return a Promise; this stub has nothing to
  // await yet (see TODO below) — revisit once it does real work.
  // eslint-disable-next-line @typescript-eslint/require-await
  async process(job: Job<MediaJobData>): Promise<void> {
    this.logger.debug(
      `processing media job ${job.id ?? "?"} (attachment ${job.data.attachmentId})`,
    );
    // TODO(media): generate thumbnails/poster, strip EXIF, transcode audio
    // and video to the target formats, then mark the Attachment READY.
  }
}
