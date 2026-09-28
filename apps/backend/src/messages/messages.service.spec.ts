import { randomUUID } from "node:crypto";

import type { SendMessageRequest } from "@ghostline/contracts";
import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { ChatsService } from "../chats/chats.service";
import { PrismaService } from "../prisma/prisma.service";
import { ChatEventsGateway } from "../realtime/chat-events.gateway";
import { REDIS_CLIENT } from "../redis/redis.module";
import { UsersService } from "../users/users.service";

import { MessagesService } from "./messages.service";

interface FakeMemberRow {
  chatId: string;
  userId: string;
  lastReadSeq: bigint;
  lastDeliveredSeq: bigint;
  muted: boolean;
}

interface FakeChatRow {
  id: string;
  type: "DIRECT" | "SAVED";
  lastSeq: bigint;
  lastMessageAt: Date | null;
  createdAt: Date;
}

interface FakeMessageRow {
  id: string;
  chatId: string;
  seq: bigint;
  senderId: string | null;
  clientMessageId: string;
  type: "TEXT";
  text: string | null;
  attachmentId: null;
  durationMs: null;
  waveform: null;
  replyToId: string | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}

/**
 * In-memory stand-in for the Prisma models `MessagesService.sendMessage`
 * touches. `$transaction` serializes overlapping callbacks with a promise
 * chain — the same guarantee a real Postgres row lock on `chat.update`
 * gives — so this can actually catch a regression that moved the `seq`
 * increment outside the transaction (a real duplicate `(chatId, seq)`
 * insert would throw, exactly like the `@@unique` constraint would).
 */
function createFakePrisma(chats: Map<string, FakeChatRow>, members: Map<string, FakeMemberRow>) {
  const messages = new Map<string, FakeMessageRow>();
  let lock = Promise.resolve();

  const chatMember = {
    findUnique: ({ where }: { where: { chatId_userId: { chatId: string; userId: string } } }) =>
      Promise.resolve(
        members.get(memberKey(where.chatId_userId.chatId, where.chatId_userId.userId)) ?? null,
      ),
    findFirst: ({ where }: { where: { chatId: string; userId: { not: string } } }) =>
      Promise.resolve(
        [...members.values()].find(
          (m) => m.chatId === where.chatId && m.userId !== where.userId.not,
        ) ?? null,
      ),
    findMany: ({ where }: { where: { chatId: string; userId?: { not: string } } }) => {
      let rows = [...members.values()].filter((m) => m.chatId === where.chatId);
      if (where.userId?.not) rows = rows.filter((m) => m.userId !== where.userId?.not);
      return Promise.resolve(rows.map((m) => ({ ...m, user: { readReceipts: true } })));
    },
    update: ({
      where,
      data,
    }: {
      where: { chatId_userId: { chatId: string; userId: string } };
      data: Partial<FakeMemberRow>;
    }) => {
      const key = memberKey(where.chatId_userId.chatId, where.chatId_userId.userId);
      const existing = members.get(key);
      if (!existing) throw new Error("member not found");
      const updated = { ...existing, ...data };
      members.set(key, updated);
      return Promise.resolve(updated);
    },
  };

  const chat = {
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: { lastSeq?: { increment: number } };
    }) => {
      const existing = chats.get(where.id);
      if (!existing) throw new Error("chat not found");
      const updated = {
        ...existing,
        lastSeq: existing.lastSeq + BigInt(data.lastSeq?.increment ?? 0),
        lastMessageAt: new Date(),
      };
      chats.set(where.id, updated);
      return Promise.resolve(updated);
    },
  };

  const message = {
    create: ({
      data,
    }: {
      data: Omit<FakeMessageRow, "id" | "createdAt" | "editedAt" | "deletedAt">;
    }) => {
      const duplicateSeq = [...messages.values()].some(
        (m) => m.chatId === data.chatId && m.seq === data.seq,
      );
      const duplicateClientMessage = [...messages.values()].some(
        (m) => m.senderId === data.senderId && m.clientMessageId === data.clientMessageId,
      );
      if (duplicateSeq || duplicateClientMessage) {
        // Mirrors `@@unique([chatId, seq])` and `@@unique([senderId, clientMessageId])`.
        throw new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
        });
      }
      const row: FakeMessageRow = {
        id: randomUUID(),
        editedAt: null,
        deletedAt: null,
        createdAt: new Date(),
        ...data,
      };
      messages.set(row.id, row);
      return Promise.resolve(row);
    },
    findUnique: ({
      where,
    }: {
      where: {
        id?: string;
        senderId_clientMessageId?: { senderId: string; clientMessageId: string };
      };
    }) => {
      if (where.id) return Promise.resolve(messages.get(where.id) ?? null);
      if (where.senderId_clientMessageId) {
        const { senderId, clientMessageId } = where.senderId_clientMessageId;
        return Promise.resolve(
          [...messages.values()].find(
            (m) => m.senderId === senderId && m.clientMessageId === clientMessageId,
          ) ?? null,
        );
      }
      return Promise.resolve(null);
    },
  };

  const user = {
    findUnique: () => Promise.resolve({ readReceipts: true }),
  };

  const prisma = { chatMember, chat, message, user };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for a $transaction callback taking the same shape as PrismaService
  (prisma as any).$transaction = async (fn: (tx: typeof prisma) => Promise<unknown>) => {
    const previous = lock;
    let release: () => void = () => undefined;
    lock = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn(prisma);
    } finally {
      release();
    }
  };

  return { prisma, messages };
}

function memberKey(chatId: string, userId: string): string {
  return `${chatId}:${userId}`;
}

async function buildMessagesService(options: { blocked?: boolean } = {}) {
  const chats = new Map<string, FakeChatRow>();
  const members = new Map<string, FakeMemberRow>();
  const chatId = "chat-1";
  chats.set(chatId, {
    id: chatId,
    type: "DIRECT",
    lastSeq: 0n,
    lastMessageAt: null,
    createdAt: new Date(),
  });
  members.set(memberKey(chatId, "alice"), {
    chatId,
    userId: "alice",
    lastReadSeq: 0n,
    lastDeliveredSeq: 0n,
    muted: false,
  });
  members.set(memberKey(chatId, "bob"), {
    chatId,
    userId: "bob",
    lastReadSeq: 0n,
    lastDeliveredSeq: 0n,
    muted: false,
  });

  const { prisma, messages } = createFakePrisma(chats, members);

  const fakeUsers = { isBlockedEitherWay: () => Promise.resolve(options.blocked ?? false) };
  const fakeChats = {
    assertMember: () => Promise.resolve(),
    getChatListItemForUser: () => Promise.resolve({}),
  };
  const fakeEvents = { server: { to: () => ({ emit: () => undefined }) } };
  const fakeRedis = { scard: () => Promise.resolve(0) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      MessagesService,
      { provide: PrismaService, useValue: prisma },
      { provide: UsersService, useValue: fakeUsers },
      { provide: ChatsService, useValue: fakeChats },
      { provide: ChatEventsGateway, useValue: fakeEvents },
      { provide: REDIS_CLIENT, useValue: fakeRedis },
    ],
  }).compile();

  return { service: moduleRef.get(MessagesService), chatId, messages };
}

function sendDto(chatId: string, text: string): SendMessageRequest {
  return { chatId, clientMessageId: randomUUID(), type: "text", text };
}

describe("MessagesService", () => {
  describe("sendMessage — seq allocation", () => {
    it("allocates strictly increasing, non-colliding seqs under concurrent sends", async () => {
      const { service, chatId } = await buildMessagesService();

      const sends = Array.from({ length: 20 }, (_, i) =>
        service.sendMessage("alice", sendDto(chatId, `message ${String(i)}`)),
      );
      const results = await Promise.all(sends);

      const seqs = results.map((m) => m.seq);
      expect(new Set(seqs.map(String)).size).toBe(20);
      expect([...seqs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(
        Array.from({ length: 20 }, (_, i) => BigInt(i + 1)),
      );
    });

    it("returns the existing message instead of erroring on a retried optimistic send", async () => {
      const { service, chatId } = await buildMessagesService();
      const dto = sendDto(chatId, "hello");

      const first = await service.sendMessage("alice", dto);
      const retried = await service.sendMessage("alice", dto);

      expect(retried.id).toBe(first.id);
      expect(retried.seq).toBe(first.seq);
    });
  });

  describe("sendMessage — block prevents write", () => {
    it("rejects sending when either side has blocked the other (FR-USER-05)", async () => {
      const { service, chatId } = await buildMessagesService({ blocked: true });

      await expect(service.sendMessage("alice", sendDto(chatId, "hi"))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
