import { randomUUID } from "node:crypto";

import type {
  Attachment,
  CompleteUploadRequest,
  PresignUploadRequest,
  PresignUploadResponse,
} from "@ghostline/contracts";
import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import type { Queue } from "bullmq";

import { AppConfigService } from "../config/app-config.service";
import { MEDIA_QUEUE, type MediaJobData } from "../jobs/media.processor";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

import { toPrismaAttachmentKind, toWireAttachment } from "./attachment.util";

/**
 * Presigned upload flow (REQUIREMENTS.md §7.6): the backend never sees
 * file bytes — it only signs a PUT URL, then (once the client says it's
 * done) checks the object actually landed in S3 before trusting it.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
    @InjectQueue(MEDIA_QUEUE) private readonly mediaQueue: Queue<MediaJobData>,
  ) {}

  /** FR-MEDIA-04: rejects anything over the configured limit before creating a `PENDING` row. */
  async presignUpload(userId: string, dto: PresignUploadRequest): Promise<PresignUploadResponse> {
    if (dto.size > this.config.mediaMaxFileSizeBytes) {
      throw new PayloadTooLargeException(
        `file exceeds the ${String(this.config.mediaMaxFileSizeBytes)} byte limit`,
      );
    }

    // The id is generated up front so it can be embedded in the S3 key —
    // one `create`, key and row agree from the start.
    const id = randomUUID();
    const key = buildObjectKey(id, dto.fileName);
    const attachment = await this.prisma.attachment.create({
      data: {
        id,
        uploaderId: userId,
        status: "PENDING",
        kind: toPrismaAttachmentKind(dto.kind),
        key,
        mime: dto.mime,
        size: dto.size,
        name: dto.fileName,
      },
    });

    const uploadUrl = await this.storage.createUploadUrl(key, dto.mime);
    return { attachmentId: attachment.id, uploadUrl };
  }

  /**
   * Confirms the client's PUT actually landed in S3, marks the attachment
   * `READY` and enqueues processing (thumbnails/EXIF strip/transcode —
   * the processor itself is a no-op stub until that work lands). Re-running
   * this on an already-`READY` attachment is a harmless no-op — a client
   * that retried after a dropped response shouldn't get an error for it.
   */
  async completeUpload(
    userId: string,
    attachmentId: string,
    dto: CompleteUploadRequest,
  ): Promise<Attachment> {
    if (dto.attachmentId !== attachmentId) {
      throw new BadRequestException("attachmentId in the body must match the URL");
    }

    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) {
      throw new NotFoundException("attachment not found");
    }
    if (attachment.uploaderId !== userId) {
      throw new ForbiddenException("not your attachment");
    }

    if (attachment.status === "READY") {
      return toWireAttachment(attachment, this.storage);
    }

    const head = await this.storage.headObject(attachment.key);
    if (!head) {
      throw new NotFoundException("upload not found in storage yet — retry the PUT first");
    }

    const updated = await this.prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        status: "READY",
        ...(dto.width !== undefined ? { width: dto.width } : {}),
        ...(dto.height !== undefined ? { height: dto.height } : {}),
      },
    });

    await this.mediaQueue.add("process", { attachmentId: updated.id });

    return toWireAttachment(updated, this.storage);
  }
}

/**
 * `<attachmentId>/<sanitized original name>` — keeps the extension (media
 * players/browsers use it as a MIME hint) while stripping path separators
 * and anything else that isn't safe unescaped in an S3 key or a
 * `Content-Disposition` filename.
 */
function buildObjectKey(attachmentId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-200);
  return `attachments/${attachmentId}/${safeName}`;
}
