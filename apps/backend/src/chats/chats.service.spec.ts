import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { ChatEventsGateway } from "../realtime/chat-events.gateway";
import { REDIS_CLIENT } from "../redis/redis.module";
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

async function buildChatsService(options: { blocked?: boolean } = {}) {
  const fakePrisma = {
    user: { findUnique: () => Promise.resolve(peerUser) },
  };
  const fakeUsers = { isBlockedEitherWay: () => Promise.resolve(options.blocked ?? false) };
  const fakeEvents = { server: { to: () => ({ emit: () => undefined }) } };
  const fakeRedis = { scard: () => Promise.resolve(0) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ChatsService,
      { provide: PrismaService, useValue: fakePrisma },
      { provide: UsersService, useValue: fakeUsers },
      { provide: ChatEventsGateway, useValue: fakeEvents },
      { provide: REDIS_CLIENT, useValue: fakeRedis },
    ],
  }).compile();

  return moduleRef.get(ChatsService);
}

describe("ChatsService", () => {
  it("is defined", async () => {
    const service = await buildChatsService();
    expect(service).toBeDefined();
  });

  describe("openDirect — block prevents write", () => {
    it("refuses to open a chat with a blocked user (FR-USER-05)", async () => {
      const service = await buildChatsService({ blocked: true });

      await expect(
        service.openDirect("11111111-1111-1111-1111-111111111111", peerUser.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
