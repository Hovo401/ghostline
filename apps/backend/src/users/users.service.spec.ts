import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { ChatEventsGateway } from "../realtime/chat-events.gateway";
import { REDIS_CLIENT } from "../redis/redis.module";
import { StorageService } from "../storage/storage.service";

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

function buildFakeEvents() {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  return { events: { server: { to } }, to, emit };
}

async function buildUsersService(
  prisma: Record<string, unknown>,
  options: { events?: ReturnType<typeof buildFakeEvents>["events"] } = {},
) {
  const fakeStorage = {
    createDownloadUrl: vi.fn((key: string) => Promise.resolve(`http://example.test/${key}`)),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      UsersService,
      { provide: PrismaService, useValue: prisma },
      { provide: StorageService, useValue: fakeStorage },
      { provide: ChatEventsGateway, useValue: options.events ?? buildFakeEvents().events },
      // `searchUsers`/`updateMe`'s broadcast both call `isOnline`, which
      // does a Redis `SCARD` — stub it as "nobody online" everywhere else.
      { provide: REDIS_CLIENT, useValue: { scard: () => Promise.resolve(0) } },
    ],
  }).compile();
  return { service: moduleRef.get(UsersService), fakeStorage };
}

describe("UsersService", () => {
  describe("getMe", () => {
    it("maps the user row to MeResponse", async () => {
      const { service } = await buildUsersService({
        user: { findUnique: () => Promise.resolve(user) },
      });

      await expect(service.getMe(user.id)).resolves.toEqual({
        id: user.id,
        username: "alice",
        displayName: "Alice",
        avatarKey: null,
        avatarUrl: null,
        bio: null,
        online: true,
        lastSeenAt: null,
        showOnline: true,
        readReceipts: false,
      });
    });

    it("throws NotFoundException when the user no longer exists", async () => {
      const { service } = await buildUsersService({
        user: { findUnique: () => Promise.resolve(null) },
      });
      await expect(service.getMe(user.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("checkAvailability", () => {
    it("reports available when no user has the username", async () => {
      const { service } = await buildUsersService({
        user: { findUnique: () => Promise.resolve(null) },
      });
      await expect(service.checkAvailability("bob")).resolves.toEqual({ available: true });
    });

    it("reports unavailable when the username is taken", async () => {
      const { service } = await buildUsersService({
        user: { findUnique: () => Promise.resolve({ id: user.id }) },
      });
      await expect(service.checkAvailability("alice")).resolves.toEqual({ available: false });
    });
  });

  describe("updateMe", () => {
    function buildUpdateStore(overrides: { attachment?: Record<string, unknown> | null } = {}) {
      const users = new Map([[user.id, { ...user }]]);
      const chatMembers: { chatId: string; userId: string }[] = [];
      const blocks = new Map<string, { userId: string; blockedId: string }>();

      return {
        users,
        chatMembers,
        blocks,
        attachment: {
          findUnique: () => Promise.resolve(overrides.attachment ?? null),
        },
        user: {
          findUnique: ({ where }: { where: { id: string; username?: string } }) => {
            if (where.username !== undefined) {
              return Promise.resolve(
                [...users.values()].find((u) => u.username === where.username) ?? null,
              );
            }
            return Promise.resolve(users.get(where.id) ?? null);
          },
          update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const existing = users.get(where.id);
            if (!existing) throw new Error("user not found");
            const updated = { ...existing, ...data };
            users.set(where.id, updated);
            return Promise.resolve(updated);
          },
        },
        chatMember: {
          findMany: ({
            where,
          }: {
            where: {
              userId?: string | { not: string };
              chatId?: { in: string[] };
            };
          }) => {
            const rows = chatMembers.filter((m) => {
              if (typeof where.userId === "string" && m.userId !== where.userId) return false;
              if (where.userId && typeof where.userId === "object" && m.userId === where.userId.not)
                return false;
              if (where.chatId && !where.chatId.in.includes(m.chatId)) return false;
              return true;
            });
            const seen = new Set<string>();
            return Promise.resolve(
              rows
                .filter((m) => {
                  if (seen.has(m.userId)) return false;
                  seen.add(m.userId);
                  return true;
                })
                .map((m) => ({ ...m, user: { showOnline: true } })),
            );
          },
        },
        block: {
          count: ({ where }: { where: { OR: { userId: string; blockedId: string }[] } }) => {
            const key = (userId: string, blockedId: string) => `${userId}:${blockedId}`;
            const count = where.OR.filter((clause) =>
              blocks.has(key(clause.userId, clause.blockedId)),
            ).length;
            return Promise.resolve(count);
          },
        },
      };
    }

    it("updates displayName/bio and returns avatarUrl", async () => {
      const store = buildUpdateStore();
      const { service } = await buildUsersService(store);

      const result = await service.updateMe(user.id, {
        displayName: "Alicia",
        bio: "hello",
      });

      expect(result.displayName).toBe("Alicia");
      expect(result.bio).toBe("hello");
      expect(result.avatarUrl).toBeNull();
    });

    it("rejects a username already taken by someone else", async () => {
      const store = buildUpdateStore();
      store.users.set("other-id", { ...user, id: "other-id", username: "bob" });
      const { service } = await buildUsersService(store);

      await expect(service.updateMe(user.id, { username: "bob" })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("allows re-submitting your own current username", async () => {
      const store = buildUpdateStore();
      const { service } = await buildUsersService(store);

      await expect(service.updateMe(user.id, { username: "alice" })).resolves.toMatchObject({
        username: "alice",
      });
    });

    it("404s when the avatar attachment doesn't exist or isn't the caller's", async () => {
      const store = buildUpdateStore({ attachment: null });
      const { service } = await buildUsersService(store);

      await expect(
        service.updateMe(user.id, { avatarAttachmentId: "22222222-2222-2222-2222-222222222222" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("400s when the attachment wasn't presigned as an avatar", async () => {
      const store = buildUpdateStore({
        attachment: { uploaderId: user.id, status: "READY", kind: "IMAGE", key: "k" },
      });
      const { service } = await buildUsersService(store);

      await expect(
        service.updateMe(user.id, { avatarAttachmentId: "22222222-2222-2222-2222-222222222222" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("409s when the avatar attachment hasn't finished uploading", async () => {
      const store = buildUpdateStore({
        attachment: { uploaderId: user.id, status: "PENDING", kind: "AVATAR", key: "k" },
      });
      const { service } = await buildUsersService(store);

      await expect(
        service.updateMe(user.id, { avatarAttachmentId: "22222222-2222-2222-2222-222222222222" }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("adopts a READY avatar attachment's key and broadcasts the update to chat-mates", async () => {
      const store = buildUpdateStore({
        attachment: {
          uploaderId: user.id,
          status: "READY",
          kind: "AVATAR",
          key: "avatars/pic.png",
        },
      });
      store.chatMembers.push(
        { chatId: "chat-1", userId: user.id },
        { chatId: "chat-1", userId: "bob" },
      );
      const fake = buildFakeEvents();
      const { service } = await buildUsersService(store, { events: fake.events });

      const result = await service.updateMe(user.id, {
        avatarAttachmentId: "22222222-2222-2222-2222-222222222222",
      });

      expect(result.avatarKey).toBe("avatars/pic.png");
      expect(result.avatarUrl).toBe("http://example.test/avatars/pic.png");
      expect(fake.to).toHaveBeenCalledWith("user:bob");
      expect(fake.emit).toHaveBeenCalledWith(
        "user:updated",
        expect.objectContaining({ id: user.id, avatarKey: "avatars/pic.png" }),
      );
    });

    it("doesn't broadcast to a chat-mate who blocked (or is blocked by) the caller", async () => {
      const store = buildUpdateStore();
      store.chatMembers.push(
        { chatId: "chat-1", userId: user.id },
        { chatId: "chat-1", userId: "bob" },
      );
      store.blocks.set(`${user.id}:bob`, { userId: user.id, blockedId: "bob" });
      const fake = buildFakeEvents();
      const { service } = await buildUsersService(store, { events: fake.events });

      await service.updateMe(user.id, { displayName: "Alicia" });

      expect(fake.emit).not.toHaveBeenCalled();
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
      const { service } = await buildUsersService(store);

      await service.blockUser("alice", "bob");
      await service.blockUser("alice", "bob");
      expect(store.blocks.size).toBe(1);

      await expect(service.blockUser("alice", "alice")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("isBlockedEitherWay is true regardless of who placed the block", async () => {
      const store = buildBlockStore();
      const { service } = await buildUsersService(store);

      await service.blockUser("alice", "bob");

      await expect(service.isBlockedEitherWay("alice", "bob")).resolves.toBe(true);
      await expect(service.isBlockedEitherWay("bob", "alice")).resolves.toBe(true);
      await expect(service.isBlockedEitherWay("alice", "carol")).resolves.toBe(false);
    });

    it("unblocking removes the block in that direction", async () => {
      const store = buildBlockStore();
      const { service } = await buildUsersService(store);

      await service.blockUser("alice", "bob");
      await service.unblockUser("alice", "bob");

      await expect(service.isBlockedEitherWay("alice", "bob")).resolves.toBe(false);
    });
  });
});
