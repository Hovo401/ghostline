import { randomUUID } from "node:crypto";

import {
  MULTIPART_THRESHOLD_BYTES,
  type Attachment,
  type AttachmentLimitsResponse,
  type CompleteUploadRequest,
  type PresignPartsRequest,
  type PresignPartsResponse,
  type PresignUploadRequest,
  type PresignUploadResponse,
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

/** FR-MEDIA-05: at most this many files can be attached to one send (one message per file). */
const MAX_FILES_PER_SEND = 10;

/**
 * Presigned upload flow (REQUIREMENTS.md §7.6): the backend never sees
 * file bytes — it only signs a PUT URL (or, for files over
 * `MULTIPART_THRESHOLD_BYTES`, a multipart upload's part URLs), then (once
 * the client says it's done) checks the object actually landed in S3 before
 * trusting it.
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

    if (dto.size <= MULTIPART_THRESHOLD_BYTES) {
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
      return { attachmentId: attachment.id, mode: "single", uploadUrl };
    }

    const uploadId = await this.storage.createMultipartUpload(key, dto.mime);
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
        uploadId,
      },
    });
    const partCount = Math.ceil(dto.size / MULTIPART_THRESHOLD_BYTES);
    return {
      attachmentId: attachment.id,
      mode: "multipart",
      partSize: MULTIPART_THRESHOLD_BYTES,
      partCount,
    };
  }

  /** Presigns the requested part numbers of an in-progress multipart upload, on demand. */
  async presignParts(
    userId: string,
    attachmentId: string,
    dto: PresignPartsRequest,
  ): Promise<PresignPartsResponse> {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (attachment?.uploaderId !== userId) {
      throw new NotFoundException("attachment not found");
    }
    const { uploadId } = attachment;
    if (attachment.status !== "PENDING" || !uploadId) {
      throw new BadRequestException("attachment is not an in-progress multipart upload");
    }

    const parts = await Promise.all(
      dto.partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.createUploadPartUrl(attachment.key, uploadId, partNumber),
      })),
    );
    return { parts };
  }

  /**
   * Confirms the client's upload actually landed in S3, marks the attachment
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

    if (attachment.uploadId) {
      await this.storage.completeMultipartUpload(attachment.key, attachment.uploadId);
    }

    const head = await this.storage.headObject(attachment.key);
    if (!head) {
      throw new NotFoundException("upload not found in storage yet — retry the upload first");
    }
    // The client declares `size` up front at presign time — verify the
    // object that actually landed matches it, so a lying client or a
    // corrupted/incomplete multipart upload can't sneak past as `READY`.
    if (head.ContentLength !== undefined && BigInt(head.ContentLength) !== attachment.size) {
      throw new BadRequestException("uploaded object size does not match the declared size");
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

  /** Cancels a not-yet-finished upload: aborts multipart (if any), best-effort deletes the object, drops the row. */
  async cancelUpload(userId: string, attachmentId: string): Promise<void> {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (attachment?.uploaderId !== userId) {
      throw new NotFoundException("attachment not found");
    }
    if (attachment.status !== "PENDING") {
      throw new BadRequestException("only a pending upload can be cancelled");
    }

    if (attachment.uploadId) {
      await this.storage.abortMultipartUpload(attachment.key, attachment.uploadId);
    }
    try {
      await this.storage.deleteObject(attachment.key);
    } catch {
      // Best-effort: nothing ever landed (single-PUT upload cancelled before
      // finishing) is the common case, not an error worth surfacing.
    }
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
  }

  getLimits(): AttachmentLimitsResponse {
    return {
      maxFileSizeBytes: this.config.mediaMaxFileSizeBytes,
      maxFilesPerSend: MAX_FILES_PER_SEND,
    };
  }

  /**
   * A fresh presigned `Attachment` for playback/download after the one
   * embedded in a message may have expired (docs/adr/0007, 0010) — allowed
   * for the uploader, or anyone who shares a chat with a message that
   * references this attachment (same "belongs to a chat you're in" rule
   * `ChatsService`/`MessagesService` apply everywhere else).
   */
  async getAttachment(userId: string, attachmentId: string): Promise<Attachment> {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) {
      throw new NotFoundException("attachment not found");
    }

    const isUploader = attachment.uploaderId === userId;
    const sharesChat = isUploader
      ? true
      : (await this.prisma.message.findFirst({
          where: { attachmentId, chat: { members: { some: { userId } } } },
          select: { id: true },
        })) !== null;
    if (!sharesChat) {
      throw new NotFoundException("attachment not found");
    }

    return toWireAttachment(attachment, this.storage);
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
