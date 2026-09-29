import { randomUUID } from "node:crypto";

import { MULTIPART_THRESHOLD_BYTES } from "@ghostline/contracts";
import { getQueueToken } from "@nestjs/bullmq";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import { AppConfigService } from "../config/app-config.service";
import { MEDIA_QUEUE } from "../jobs/media.processor";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

import { AttachmentsService } from "./attachments.service";

interface FakeAttachmentRow {
  id: string;
  uploaderId: string;
  status: "PENDING" | "READY";
  kind: "IMAGE" | "FILE" | "VOICE" | "VIDEO" | "AVATAR";
  key: string;
  mime: string;
  size: bigint;
  name: string | null;
  width: number | null;
  height: number | null;
  uploadId: string | null;
  createdAt: Date;
}

interface FakeMessageRow {
  attachmentId: string;
  chatId: string;
}

function buildFakePrisma(options: { chatMemberships?: Map<string, Set<string>> } = {}) {
  const rows = new Map<string, FakeAttachmentRow>();
  const messages: FakeMessageRow[] = [];
  const chatMemberships = options.chatMemberships ?? new Map<string, Set<string>>();

  const attachment = {
    create: ({
      data,
    }: {
      data: Omit<FakeAttachmentRow, "createdAt" | "size" | "uploadId"> & {
        size: number;
        uploadId?: string;
      };
    }) => {
      const row: FakeAttachmentRow = {
        ...data,
        uploadId: data.uploadId ?? null,
        size: BigInt(data.size),
        createdAt: new Date(),
      };
      rows.set(row.id, row);
      return Promise.resolve(row);
    },
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(rows.get(where.id) ?? null),
    update: ({ where, data }: { where: { id: string }; data: Partial<FakeAttachmentRow> }) => {
      const existing = rows.get(where.id);
      if (!existing) throw new Error("attachment not found");
      const updated = { ...existing, ...data };
      rows.set(where.id, updated);
      return Promise.resolve(updated);
    },
    delete: ({ where }: { where: { id: string } }) => {
      rows.delete(where.id);
      return Promise.resolve();
    },
  };

  const message = {
    findFirst: ({
      where,
    }: {
      where: { attachmentId: string; chat: { members: { some: { userId: string } } } };
    }) => {
      const match = messages.find((m) => m.attachmentId === where.attachmentId);
      if (!match) return Promise.resolve(null);
      const members = chatMemberships.get(match.chatId) ?? new Set();
      return Promise.resolve(members.has(where.chat.members.some.userId) ? { id: "msg" } : null);
    },
  };

  return { prisma: { attachment, message }, rows, messages, chatMemberships };
}

async function buildAttachmentsService(
  options: { maxSize?: number; chatMemberships?: Map<string, Set<string>> } = {},
) {
  const { prisma, rows, messages, chatMemberships } = buildFakePrisma(options);
  const createUploadUrl = vi.fn(() => Promise.resolve("http://example.test/upload"));
  const createDownloadUrl = vi.fn(() => Promise.resolve("http://example.test/download"));
  const headObject = vi.fn((key: string) => {
    const row = [...rows.values()].find((r) => r.key === key);
    return Promise.resolve<Record<string, unknown> | null>({
      ContentLength: row ? Number(row.size) : 0,
    });
  });
  const createMultipartUpload = vi.fn(() => Promise.resolve("upload-id-1"));
  const createUploadPartUrl = vi.fn((_key: string, _uploadId: string, partNumber: number) =>
    Promise.resolve(`http://example.test/part/${String(partNumber)}`),
  );
  const completeMultipartUpload = vi.fn(() => Promise.resolve());
  const abortMultipartUpload = vi.fn(() => Promise.resolve());
  const deleteObject = vi.fn(() => Promise.resolve());
  const fakeStorage = {
    createUploadUrl,
    createDownloadUrl,
    headObject,
    createMultipartUpload,
    createUploadPartUrl,
    completeMultipartUpload,
    abortMultipartUpload,
    deleteObject,
  };
  const fakeConfig = { mediaMaxFileSizeBytes: options.maxSize ?? 1_000_000_000 };
  const add = vi.fn(() => Promise.resolve());
  const fakeQueue = { add };

  const moduleRef = await Test.createTestingModule({
    providers: [
      AttachmentsService,
      { provide: PrismaService, useValue: prisma },
      { provide: StorageService, useValue: fakeStorage },
      { provide: AppConfigService, useValue: fakeConfig },
      { provide: getQueueToken(MEDIA_QUEUE), useValue: fakeQueue },
    ],
  }).compile();

  return {
    service: moduleRef.get(AttachmentsService),
    rows,
    messages,
    chatMemberships,
    fakeStorage,
    fakeQueue: { add },
  };
}

describe("AttachmentsService", () => {
  describe("presignUpload", () => {
    it("rejects a file over the configured size limit (FR-MEDIA-04)", async () => {
      const { service } = await buildAttachmentsService({ maxSize: 1000 });

      await expect(
        service.presignUpload("user-1", {
          kind: "image",
          mime: "image/png",
          size: 2000,
          fileName: "photo.png",
        }),
      ).rejects.toMatchObject({ status: 413 });
    });

    it("does a single presigned PUT for a file at or under the multipart threshold", async () => {
      const { service, rows, fakeStorage } = await buildAttachmentsService();

      const result = await service.presignUpload("user-1", {
        kind: "image",
        mime: "image/png",
        size: 2000,
        fileName: "photo.png",
      });

      expect(result).toMatchObject({ mode: "single", uploadUrl: "http://example.test/upload" });
      const row = rows.get(result.attachmentId);
      expect(row).toMatchObject({ uploaderId: "user-1", status: "PENDING", mime: "image/png" });
      expect(fakeStorage.createUploadUrl).toHaveBeenCalledWith(row?.key, "image/png");
      expect(fakeStorage.createMultipartUpload).not.toHaveBeenCalled();
    });

    it("starts a multipart upload for a file over the threshold", async () => {
      const { service, rows, fakeStorage } = await buildAttachmentsService();
      const size = MULTIPART_THRESHOLD_BYTES * 3 + 1;

      const result = await service.presignUpload("user-1", {
        kind: "video",
        mime: "video/mp4",
        size,
        fileName: "movie.mp4",
      });

      expect(result).toMatchObject({
        mode: "multipart",
        partSize: MULTIPART_THRESHOLD_BYTES,
        partCount: 4,
      });
      expect(fakeStorage.createMultipartUpload).toHaveBeenCalledTimes(1);
      const row = rows.get(result.attachmentId);
      expect(row?.uploadId).toBe("upload-id-1");
    });
  });

  describe("presignParts", () => {
    async function seedMultipartAttachment(service: AttachmentsService) {
      return service.presignUpload("user-1", {
        kind: "video",
        mime: "video/mp4",
        size: MULTIPART_THRESHOLD_BYTES * 3 + 1,
        fileName: "movie.mp4",
      });
    }

    it("returns presigned URLs for the requested part numbers", async () => {
      const { service, fakeStorage } = await buildAttachmentsService();
      const { attachmentId } = await seedMultipartAttachment(service);

      const result = await service.presignParts("user-1", attachmentId, { partNumbers: [1, 2] });

      expect(result.parts).toEqual([
        { partNumber: 1, url: "http://example.test/part/1" },
        { partNumber: 2, url: "http://example.test/part/2" },
      ]);
      expect(fakeStorage.createUploadPartUrl).toHaveBeenCalledTimes(2);
    });

    it("404s for someone else's attachment", async () => {
      const { service } = await buildAttachmentsService();
      const { attachmentId } = await seedMultipartAttachment(service);

      await expect(
        service.presignParts("someone-else", attachmentId, { partNumbers: [1] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects a single-PUT (non-multipart) attachment", async () => {
      const { service } = await buildAttachmentsService();
      const { attachmentId } = await service.presignUpload("user-1", {
        kind: "image",
        mime: "image/png",
        size: 2000,
        fileName: "photo.png",
      });

      await expect(
        service.presignParts("user-1", attachmentId, { partNumbers: [1] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("completeUpload", () => {
    async function seedPendingAttachment(service: AttachmentsService) {
      return service.presignUpload("user-1", {
        kind: "image",
        mime: "image/png",
        size: 2000,
        fileName: "photo.png",
      });
    }

    it("rejects when the body attachmentId doesn't match the URL", async () => {
      const { service } = await buildAttachmentsService();

      await expect(
        service.completeUpload("user-1", randomUUID(), { attachmentId: randomUUID() }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("404s for an attachment that doesn't exist", async () => {
      const { service } = await buildAttachmentsService();
      const id = randomUUID();

      await expect(
        service.completeUpload("user-1", id, { attachmentId: id }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("403s when the caller isn't the uploader", async () => {
      const { service } = await buildAttachmentsService();
      const { attachmentId } = await seedPendingAttachment(service);

      await expect(
        service.completeUpload("someone-else", attachmentId, { attachmentId }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("404s when the object never landed in S3", async () => {
      const { service, fakeStorage } = await buildAttachmentsService();
      const { attachmentId } = await seedPendingAttachment(service);
      fakeStorage.headObject.mockResolvedValueOnce(null);

      await expect(
        service.completeUpload("user-1", attachmentId, { attachmentId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects when the uploaded object's size doesn't match the declared size", async () => {
      const { service, fakeStorage } = await buildAttachmentsService();
      const { attachmentId } = await seedPendingAttachment(service);
      fakeStorage.headObject.mockResolvedValueOnce({ ContentLength: 1 });

      await expect(
        service.completeUpload("user-1", attachmentId, { attachmentId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("marks the attachment READY, stores dimensions and enqueues a media job", async () => {
      const { service, rows, fakeQueue } = await buildAttachmentsService();
      const { attachmentId } = await seedPendingAttachment(service);

      const result = await service.completeUpload("user-1", attachmentId, {
        attachmentId,
        width: 800,
        height: 600,
      });

      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
      expect(result.url).toBe("http://example.test/download");
      expect(rows.get(attachmentId)?.status).toBe("READY");
      expect(fakeQueue.add).toHaveBeenCalledTimes(1);
      expect(fakeQueue.add).toHaveBeenCalledWith("process", { attachmentId });
    });

    it("is idempotent on an already-READY attachment (no duplicate enqueue)", async () => {
      const { service, fakeQueue } = await buildAttachmentsService();
      const { attachmentId } = await seedPendingAttachment(service);
      await service.completeUpload("user-1", attachmentId, { attachmentId });

      await service.completeUpload("user-1", attachmentId, { attachmentId });

      expect(fakeQueue.add).toHaveBeenCalledTimes(1);
    });

    it("resolves parts via ListParts (server-side) before completing a multipart upload", async () => {
      const { service, fakeStorage } = await buildAttachmentsService();
      const { attachmentId } = await service.presignUpload("user-1", {
        kind: "video",
        mime: "video/mp4",
        size: MULTIPART_THRESHOLD_BYTES * 2 + 1,
        fileName: "movie.mp4",
      });

      await service.completeUpload("user-1", attachmentId, { attachmentId });

      expect(fakeStorage.completeMultipartUpload).toHaveBeenCalledTimes(1);
      expect(fakeStorage.completeMultipartUpload).toHaveBeenCalledWith(
        expect.any(String),
        "upload-id-1",
      );
    });
  });

  describe("cancelUpload", () => {
    it("aborts multipart, deletes the object and drops the row", async () => {
      const { service, rows, fakeStorage } = await buildAttachmentsService();
      const { attachmentId } = await service.presignUpload("user-1", {
        kind: "video",
        mime: "video/mp4",
        size: MULTIPART_THRESHOLD_BYTES * 2 + 1,
        fileName: "movie.mp4",
      });

      await service.cancelUpload("user-1", attachmentId);

      expect(fakeStorage.abortMultipartUpload).toHaveBeenCalledWith(
        expect.any(String),
        "upload-id-1",
      );
      expect(fakeStorage.deleteObject).toHaveBeenCalledTimes(1);
      expect(rows.has(attachmentId)).toBe(false);
    });

    it("404s for someone else's attachment", async () => {
      const { service } = await buildAttachmentsService();
      const { attachmentId } = await service.presignUpload("user-1", {
        kind: "image",
        mime: "image/png",
        size: 2000,
        fileName: "photo.png",
      });

      await expect(service.cancelUpload("someone-else", attachmentId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("rejects cancelling an already-READY attachment", async () => {
      const { service } = await buildAttachmentsService();
      const { attachmentId } = await service.presignUpload("user-1", {
        kind: "image",
        mime: "image/png",
        size: 2000,
        fileName: "photo.png",
      });
      await service.completeUpload("user-1", attachmentId, { attachmentId });

      await expect(service.cancelUpload("user-1", attachmentId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe("getAttachment", () => {
    it("returns a fresh presigned attachment for the uploader", async () => {
      const { service, fakeStorage } = await buildAttachmentsService();
      const { attachmentId } = await service.presignUpload("user-1", {
        kind: "image",
        mime: "image/png",
        size: 2000,
        fileName: "photo.png",
      });
      await service.completeUpload("user-1", attachmentId, { attachmentId });
      fakeStorage.createDownloadUrl.mockResolvedValueOnce("http://example.test/fresh");

      const result = await service.getAttachment("user-1", attachmentId);

      expect(result.url).toBe("http://example.test/fresh");
    });

    it("returns it for a user who shares a chat with a message referencing this attachment", async () => {
      const chatMemberships = new Map([["chat-1", new Set(["user-1", "user-2"])]]);
      const { service, messages } = await buildAttachmentsService({ chatMemberships });
      const { attachmentId } = await service.presignUpload("user-1", {
        kind: "image",
        mime: "image/png",
        size: 2000,
        fileName: "photo.png",
      });
      await service.completeUpload("user-1", attachmentId, { attachmentId });
      messages.push({ attachmentId, chatId: "chat-1" });

      await expect(service.getAttachment("user-2", attachmentId)).resolves.toMatchObject({
        id: attachmentId,
      });
    });

    it("404s for a stranger who shares no chat with the attachment", async () => {
      const chatMemberships = new Map([["chat-1", new Set(["user-1"])]]);
      const { service, messages } = await buildAttachmentsService({ chatMemberships });
      const { attachmentId } = await service.presignUpload("user-1", {
        kind: "image",
        mime: "image/png",
        size: 2000,
        fileName: "photo.png",
      });
      await service.completeUpload("user-1", attachmentId, { attachmentId });
      messages.push({ attachmentId, chatId: "chat-1" });

      await expect(service.getAttachment("stranger", attachmentId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
