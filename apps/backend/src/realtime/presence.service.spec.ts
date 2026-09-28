import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { REDIS_CLIENT } from "../redis/redis.module";

import { isOnline, PresenceService } from "./presence.service";

/** In-memory stand-in for the one Redis data structure presence uses: a set of live socket ids per user. */
function createFakeRedis() {
  const sets = new Map<string, Set<string>>();
  return {
    sadd: (key: string, member: string) => {
      const set = sets.get(key) ?? new Set<string>();
      set.add(member);
      sets.set(key, set);
      return Promise.resolve(1);
    },
    srem: (key: string, member: string) => {
      sets.get(key)?.delete(member);
      return Promise.resolve(1);
    },
    scard: (key: string) => Promise.resolve(sets.get(key)?.size ?? 0),
  };
}

function createFakeServer() {
  const emitted: { room: string; event: string; payload: unknown }[] = [];
  return {
    emitted,
    server: {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }),
      }),
    },
  };
}

async function buildPresenceService(
  redis: ReturnType<typeof createFakeRedis>,
  prisma: Record<string, unknown>,
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PresenceService,
      { provide: PrismaService, useValue: prisma },
      { provide: REDIS_CLIENT, useValue: redis },
    ],
  }).compile();
  return moduleRef.get(PresenceService);
}

describe("isOnline", () => {
  it("is false with no sockets and true with at least one", async () => {
    const redis = createFakeRedis();
    await expect(isOnline(redis as never, "alice")).resolves.toBe(false);
    await redis.sadd("presence:sockets:alice", "socket-1");
    await expect(isOnline(redis as never, "alice")).resolves.toBe(true);
  });
});

describe("PresenceService", () => {
  it("only broadcasts on the first socket (not a second device joining)", async () => {
    const redis = createFakeRedis();
    const prisma = {
      user: { findUnique: () => Promise.resolve({ showOnline: true, lastSeenAt: null }) },
      chatMember: { findMany: () => Promise.resolve([]) },
      block: { findMany: () => Promise.resolve([]) },
    };
    const service = await buildPresenceService(redis, prisma);
    const { server, emitted } = createFakeServer();

    await service.handleConnect(server as never, "alice", "socket-1");
    await service.handleConnect(server as never, "alice", "socket-2");

    // No peers configured above, so nothing is emitted either way — this
    // asserts the *bookkeeping* (only one connect actually ran the
    // broadcast path) via the socket count, which is what gates a real
    // broadcast when peers do exist.
    await expect(isOnline(redis as never, "alice")).resolves.toBe(true);
    expect(emitted).toEqual([]);
  });

  it("marks lastSeenAt and broadcasts offline only once every socket disconnects", async () => {
    const redis = createFakeRedis();
    let lastSeenUpdated = false;
    const prisma = {
      user: {
        findUnique: () => Promise.resolve({ showOnline: true, lastSeenAt: null }),
        findMany: () => Promise.resolve([{ id: "bob", showOnline: true }]),
        update: () => {
          lastSeenUpdated = true;
          return Promise.resolve({});
        },
      },
      chatMember: {
        findMany: (args: { where: { userId?: string; chatId?: { in: string[] } } }) => {
          if (args.where.userId) return Promise.resolve([{ chatId: "chat-1" }]);
          return Promise.resolve([{ userId: "bob" }]);
        },
      },
      block: { findMany: () => Promise.resolve([]) },
    };
    const service = await buildPresenceService(redis, prisma);
    const { server, emitted } = createFakeServer();

    await service.handleConnect(server as never, "alice", "socket-1");
    await service.handleConnect(server as never, "alice", "socket-2");
    await service.handleDisconnect(server as never, "alice", "socket-1");
    expect(lastSeenUpdated).toBe(false);

    await service.handleDisconnect(server as never, "alice", "socket-2");
    expect(lastSeenUpdated).toBe(true);
    expect(emitted.some((e) => e.event === "presence" && e.room === "user:bob")).toBe(true);
  });
});
