import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { REDIS_CLIENT } from "../redis/redis.module";

import { UsersService } from "./users.service";

const user = {
  id: "11111111-1111-1111-1111-111111111111",
  username: "alice",
  displayName: "Alice",
  avatarKey: null,
  bio: null,
  showOnline: true,
  readReceipts: false,
  lastSeenAt: null,
};

async function buildUsersService(prisma: Record<string, unknown>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      UsersService,
      { provide: PrismaService, useValue: prisma },
      // Only `getMe`/`checkAvailability` are under test here — neither
      // touches Redis (that's `searchUsers`'s presence lookup, T-023).
      { provide: REDIS_CLIENT, useValue: {} },
    ],
  }).compile();
  return moduleRef.get(UsersService);
}

describe("UsersService", () => {
  describe("getMe", () => {
    it("maps the user row to MeResponse", async () => {
      const service = await buildUsersService({
        user: { findUnique: () => Promise.resolve(user) },
      });

      await expect(service.getMe(user.id)).resolves.toEqual({
        id: user.id,
        username: "alice",
        displayName: "Alice",
        avatarKey: null,
        bio: null,
        online: true,
        lastSeenAt: null,
        showOnline: true,
        readReceipts: false,
      });
    });

    it("throws NotFoundException when the user no longer exists", async () => {
      const service = await buildUsersService({
        user: { findUnique: () => Promise.resolve(null) },
      });
      await expect(service.getMe(user.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("checkAvailability", () => {
    it("reports available when no user has the username", async () => {
      const service = await buildUsersService({
        user: { findUnique: () => Promise.resolve(null) },
      });
      await expect(service.checkAvailability("bob")).resolves.toEqual({ available: true });
    });

    it("reports unavailable when the username is taken", async () => {
      const service = await buildUsersService({
        user: { findUnique: () => Promise.resolve({ id: user.id }) },
      });
      await expect(service.checkAvailability("alice")).resolves.toEqual({ available: false });
    });
  });

  describe("blocking (FR-USER-05)", () => {
    function buildBlockStore() {
      const blocks = new Map<string, { userId: string; blockedId: string }>();
      const key = (userId: string, blockedId: string) => `${userId}:${blockedId}`;
      return {
        blocks,
        block: {
          upsert: ({ create }: { create: { userId: string; blockedId: string } }) => {
            blocks.set(key(create.userId, create.blockedId), create);
            return Promise.resolve(create);
          },
          deleteMany: ({ where }: { where: { userId: string; blockedId: string } }) => {
            const existed = blocks.delete(key(where.userId, where.blockedId));
            return Promise.resolve({ count: existed ? 1 : 0 });
          },
          count: ({ where }: { where: { OR: { userId: string; blockedId: string }[] } }) => {
            const count = where.OR.filter((clause) =>
              blocks.has(key(clause.userId, clause.blockedId)),
            ).length;
            return Promise.resolve(count);
          },
        },
      };
    }

    it("blocking is idempotent and rejects blocking yourself", async () => {
      const store = buildBlockStore();
      const service = await buildUsersService(store);

      await service.blockUser("alice", "bob");
      await service.blockUser("alice", "bob");
      expect(store.blocks.size).toBe(1);

      await expect(service.blockUser("alice", "alice")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("isBlockedEitherWay is true regardless of who placed the block", async () => {
      const store = buildBlockStore();
      const service = await buildUsersService(store);

      await service.blockUser("alice", "bob");

      await expect(service.isBlockedEitherWay("alice", "bob")).resolves.toBe(true);
      await expect(service.isBlockedEitherWay("bob", "alice")).resolves.toBe(true);
      await expect(service.isBlockedEitherWay("alice", "carol")).resolves.toBe(false);
    });

    it("unblocking removes the block in that direction", async () => {
      const store = buildBlockStore();
      const service = await buildUsersService(store);

      await service.blockUser("alice", "bob");
      await service.unblockUser("alice", "bob");

      await expect(service.isBlockedEitherWay("alice", "bob")).resolves.toBe(false);
    });
  });
});
