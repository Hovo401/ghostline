import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { ChatEventsGateway } from "../realtime/chat-events.gateway";
import { REDIS_CLIENT } from "../redis/redis.module";
import { StorageService } from "../storage/storage.service";
import { UsersService } from "../users/users.service";

import { ChatsService } from "./chats.service";

const peerUser = {
  id: "22222222-2222-2222-2222-222222222222",
  username: "bob",
  displayName: "Bob",
  avatarKey: null,
  bio: null,
  showOnline: true,
  readReceipts: true,
  lastSeenAt: null,
};

interface FakeAttachmentRow {
  id: string;
  key: string;
  mime: string;
  size: bigint;
  width: number | null;
  height: number | null;
  name: string | null;
}

async function buildChatsService(
  options: {
    blocked?: boolean;
    member?: boolean;
    mediaRows?: { attachment: FakeAttachmentRow | null }[];
  } = {},
) {
  const findMany = vi.fn(() => Promise.resolve(options.mediaRows ?? []));
  const fakePrisma = {
    user: { findUnique: () => Promise.resolve(peerUser) },
    chatMember: {
      findUnique: () =>
        Promise.resolve(
          options.member === false
            ? null
            : {
                chatId: "chat-1",
                userId: "alice",
                lastReadSeq: 0n,
                lastDeliveredSeq: 0n,
                muted: false,
              },
        ),
    },
    message: { findMany },
  };
  const fakeUsers = { isBlockedEitherWay: () => Promise.resolve(options.blocked ?? false) };
  const fakeEvents = { server: { to: () => ({ emit: () => undefined }) } };
  const fakeRedis = { scard: () => Promise.resolve(0) };
  const fakeStorage = { createDownloadUrl: () => Promise.resolve("http://example.test/signed") };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ChatsService,
      { provide: PrismaService, useValue: fakePrisma },
      { provide: UsersService, useValue: fakeUsers },
      { provide: ChatEventsGateway, useValue: fakeEvents },
      { provide: StorageService, useValue: fakeStorage },
      { provide: REDIS_CLIENT, useValue: fakeRedis },
    ],
  }).compile();

  return { service: moduleRef.get(ChatsService), findMany };
}

function fakeAttachment(overrides: Partial<FakeAttachmentRow> = {}): FakeAttachmentRow {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    key: "attachments/photo.png",
    mime: "image/png",
    size: 2048n,
    width: 800,
    height: 600,
    name: "photo.png",
    ...overrides,
  };
}

describe("ChatsService", () => {
  it("is defined", async () => {
    const { service } = await buildChatsService();
    expect(service).toBeDefined();
  });

  describe("openDirect — block prevents write", () => {
    it("refuses to open a chat with a blocked user (FR-USER-05)", async () => {
      const { service } = await buildChatsService({ blocked: true });

      await expect(
        service.openDirect("11111111-1111-1111-1111-111111111111", peerUser.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("listMedia — ProfilePanel media grid (T-032/F4)", () => {
    it("404s for a non-member", async () => {
      const { service } = await buildChatsService({ member: false });

      await expect(service.listMedia("chat-1", "alice")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("caps the query at 30, newest first", async () => {
      const { service, findMany } = await buildChatsService();

      await service.listMedia("chat-1", "alice");

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { seq: "desc" }, take: 30 }),
      );
    });

    it("returns each attachment with a fresh presigned url, skipping rows without one", async () => {
      const attachment = fakeAttachment();
      const { service } = await buildChatsService({
        mediaRows: [{ attachment }, { attachment: null }],
      });

      const media = await service.listMedia("chat-1", "alice");

      expect(media).toEqual([
        {
          id: attachment.id,
          key: attachment.key,
          mime: attachment.mime,
          size: 2048,
          width: 800,
          height: 600,
          name: "photo.png",
          url: "http://example.test/signed",
        },
      ]);
    });
  });
});
