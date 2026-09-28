import { randomUUID } from "node:crypto";

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
  createdAt: Date;
}

function buildFakePrisma() {
  const rows = new Map<string, FakeAttachmentRow>();

  const attachment = {
    create: ({
      data,
    }: {
      data: Omit<FakeAttachmentRow, "createdAt" | "size"> & { size: number };
    }) => {
      const row: FakeAttachmentRow = {
        ...data,
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
  };

  return { prisma: { attachment }, rows };
}

async function buildAttachmentsService(options: { maxSize?: number } = {}) {
  const { prisma, rows } = buildFakePrisma();
  const createUploadUrl = vi.fn(() => Promise.resolve("http://example.test/upload"));
  const createDownloadUrl = vi.fn(() => Promise.resolve("http://example.test/download"));
  const headObject = vi.fn(() => Promise.resolve<Record<string, unknown> | null>({}));
  const fakeStorage = { createUploadUrl, createDownloadUrl, headObject };
  const fakeConfig = { mediaMaxFileSizeBytes: options.maxSize ?? 100_000_000 };
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
    fakeStorage: { createUploadUrl, createDownloadUrl, headObject },
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

    it("creates a PENDING attachment owned by the uploader and returns a presigned PUT URL", async () => {
      const { service, rows, fakeStorage } = await buildAttachmentsService();

      const result = await service.presignUpload("user-1", {
        kind: "image",
        mime: "image/png",
        size: 2000,
        fileName: "photo.png",
      });

      expect(result.uploadUrl).toBe("http://example.test/upload");
      const row = rows.get(result.attachmentId);
      expect(row).toMatchObject({ uploaderId: "user-1", status: "PENDING", mime: "image/png" });
      expect(fakeStorage.createUploadUrl).toHaveBeenCalledWith(row?.key, "image/png");
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
  });
});
