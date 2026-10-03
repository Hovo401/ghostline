import { randomUUID } from "node:crypto";

import type { SendMessageRequest } from "@ghostline/contracts";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { ChatsService } from "../chats/chats.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { ChatEventsGateway } from "../realtime/chat-events.gateway";
import { REDIS_CLIENT } from "../redis/redis.module";
import { StorageService } from "../storage/storage.service";
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
  type: string;
  text: string | null;
  attachmentId: string | null;
  attachment: FakeAttachmentRow | null;
  durationMs: number | null;
  waveform: unknown;
  replyToId: string | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}

interface FakeReactionRow {
  messageId: string;
  userId: string;
  emoji: string;
}

interface FakeAttachmentRow {
  id: string;
  uploaderId: string;
  status: "PENDING" | "READY";
  key: string;
  mime: string;
  size: bigint;
  name: string | null;
  width: number | null;
  height: number | null;
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
function createFakePrisma(
  chats: Map<string, FakeChatRow>,
  members: Map<string, FakeMemberRow>,
  attachments: Map<string, FakeAttachmentRow>,
) {
  const messages = new Map<string, FakeMessageRow>();
  const reactions: FakeReactionRow[] = [];
  // `MESSAGE_INCLUDE` loads `reactions` with every message row.
  const withReactions = (row: FakeMessageRow) => ({
    ...row,
    reactions: reactions.filter((r) => r.messageId === row.id),
  });
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
      data: Omit<FakeMessageRow, "id" | "createdAt" | "editedAt" | "deletedAt" | "attachment">;
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
        attachment: data.attachmentId ? (attachments.get(data.attachmentId) ?? null) : null,
        ...data,
      };
      messages.set(row.id, row);
      return Promise.resolve(withReactions(row));
    },
    findUnique: ({
      where,
    }: {
      where: {
        id?: string;
        senderId_clientMessageId?: { senderId: string; clientMessageId: string };
      };
    }) => {
      if (where.id) {
        const row = messages.get(where.id);
        return Promise.resolve(row ? withReactions(row) : null);
      }
      if (where.senderId_clientMessageId) {
        const { senderId, clientMessageId } = where.senderId_clientMessageId;
        const row = [...messages.values()].find(
          (m) => m.senderId === senderId && m.clientMessageId === clientMessageId,
        );
        return Promise.resolve(row ? withReactions(row) : null);
      }
      return Promise.resolve(null);
    },
    update: ({ where, data }: { where: { id: string }; data: Partial<FakeMessageRow> }) => {
      const existing = messages.get(where.id);
      if (!existing) throw new Error("message not found");
      const updated = { ...existing, ...data };
      messages.set(where.id, updated);
      return Promise.resolve(withReactions(updated));
    },
    findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
      const row = messages.get(where.id);
      if (!row) throw new Error("message not found");
      return Promise.resolve(withReactions(row));
    },
  };

  const reaction = {
    upsert: ({
      where,
      create,
      update,
    }: {
      where: { messageId_userId: { messageId: string; userId: string } };
      create: FakeReactionRow;
      update: { emoji: string };
    }) => {
      const { messageId, userId } = where.messageId_userId;
      const existing = reactions.find((r) => r.messageId === messageId && r.userId === userId);
      if (existing) existing.emoji = update.emoji;
      else reactions.push({ ...create });
      return Promise.resolve({});
    },
    deleteMany: ({ where }: { where: { messageId: string; userId: string } }) => {
      const index = reactions.findIndex(
        (r) => r.messageId === where.messageId && r.userId === where.userId,
      );
      if (index >= 0) reactions.splice(index, 1);
      return Promise.resolve({ count: index >= 0 ? 1 : 0 });
    },
  };

  const user = {
    findUnique: () => Promise.resolve({ readReceipts: true }),
  };

  const attachment = {
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(attachments.get(where.id) ?? null),
  };

  const prisma = { chatMember, chat, message, reaction, user, attachment };

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

async function buildMessagesService(
  options: { blocked?: boolean; attachments?: FakeAttachmentRow[] } = {},
) {
  const chats = new Map<string, FakeChatRow>();
  const members = new Map<string, FakeMemberRow>();
  const attachments = new Map<string, FakeAttachmentRow>(
    (options.attachments ?? []).map((a) => [a.id, a]),
  );
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

  const { prisma, messages } = createFakePrisma(chats, members, attachments);

  const state = { blocked: options.blocked ?? false };
  const fakeUsers = { isBlockedEitherWay: () => Promise.resolve(state.blocked) };
  const fakeChats = {
    assertMember: (id: string, userId: string) =>
      members.has(memberKey(id, userId))
        ? Promise.resolve()
        : Promise.reject(new ForbiddenException("not a member")),
    getChatListItemForUser: () => Promise.resolve({}),
  };
  const emitted: { room: string; event: string; payload: unknown }[] = [];
  const fakeEvents = {
    server: {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => void emitted.push({ room, event, payload }),
      }),
    },
  };
  const fakeRedis = { scard: () => Promise.resolve(0) };
  const fakeStorage = { createDownloadUrl: () => Promise.resolve("http://example.test/signed") };
  const fakeNotifications = {
    notifyNewMessage: () => Promise.resolve(),
    notifyChatRead: () => Promise.resolve(),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      MessagesService,
      { provide: PrismaService, useValue: prisma },
      { provide: UsersService, useValue: fakeUsers },
      { provide: ChatsService, useValue: fakeChats },
      { provide: ChatEventsGateway, useValue: fakeEvents },
      { provide: StorageService, useValue: fakeStorage },
      { provide: NotificationsService, useValue: fakeNotifications },
      { provide: REDIS_CLIENT, useValue: fakeRedis },
    ],
  }).compile();

  return { service: moduleRef.get(MessagesService), chatId, messages, emitted, state };
}

function sendDto(chatId: string, text: string): SendMessageRequest {
  return { chatId, clientMessageId: randomUUID(), type: "text", text };
}

function sendImageDto(chatId: string, attachmentId: string): SendMessageRequest {
  return { chatId, clientMessageId: randomUUID(), type: "image", attachmentId };
}

function fakeAttachment(overrides: Partial<FakeAttachmentRow> = {}): FakeAttachmentRow {
  return {
    id: randomUUID(),
    uploaderId: "alice",
    status: "READY",
    key: "attachments/photo.png",
    mime: "image/png",
    size: 2048n,
    name: "photo.png",
    width: 800,
    height: 600,
    createdAt: new Date(),
    ...overrides,
  };
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

  describe("sendMessage — media attachments (T-032/F4)", () => {
    it("404s when the attachment doesn't exist", async () => {
      const { service, chatId } = await buildMessagesService();

      await expect(
        service.sendMessage("alice", sendImageDto(chatId, randomUUID())),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("404s when the attachment belongs to someone else", async () => {
      const attachment = fakeAttachment({ uploaderId: "bob" });
      const { service, chatId } = await buildMessagesService({ attachments: [attachment] });

      await expect(
        service.sendMessage("alice", sendImageDto(chatId, attachment.id)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("409s when the attachment hasn't finished uploading", async () => {
      const attachment = fakeAttachment({ uploaderId: "alice", status: "PENDING" });
      const { service, chatId } = await buildMessagesService({ attachments: [attachment] });

      await expect(
        service.sendMessage("alice", sendImageDto(chatId, attachment.id)),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("sends a media message and embeds the attachment inline", async () => {
      const attachment = fakeAttachment({ uploaderId: "alice" });
      const { service, chatId } = await buildMessagesService({ attachments: [attachment] });

      const message = await service.sendMessage("alice", sendImageDto(chatId, attachment.id));

      expect(message.type).toBe("image");
      expect(message.attachmentId).toBe(attachment.id);
      expect(message.attachment).toMatchObject({
        id: attachment.id,
        mime: "image/png",
        width: 800,
        height: 600,
        url: "http://example.test/signed",
      });
    });
  });

  describe("editMessage (FR-MSG-05)", () => {
    it("edits own text and marks it edited", async () => {
      const { service, chatId } = await buildMessagesService();
      const sent = await service.sendMessage("alice", sendDto(chatId, "helo"));

      const edited = await service.editMessage("alice", sent.id, "hello");

      expect(edited.text).toBe("hello");
      expect(edited.editedAt).not.toBeNull();
    });

    it("edits the caption of own photo", async () => {
      const attachment = fakeAttachment({ uploaderId: "alice" });
      const { service, chatId } = await buildMessagesService({ attachments: [attachment] });
      const sent = await service.sendMessage("alice", sendImageDto(chatId, attachment.id));

      const edited = await service.editMessage("alice", sent.id, "caption");

      expect(edited.text).toBe("caption");
      expect(edited.attachmentId).toBe(attachment.id);
    });

    it("rejects editing a voice message", async () => {
      const attachment = fakeAttachment({ uploaderId: "alice", mime: "audio/webm" });
      const { service, chatId } = await buildMessagesService({ attachments: [attachment] });
      const sent = await service.sendMessage("alice", {
        chatId,
        clientMessageId: randomUUID(),
        type: "voice",
        attachmentId: attachment.id,
        durationMs: 1000,
      });

      await expect(service.editMessage("alice", sent.id, "x")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("rejects editing someone else's message", async () => {
      const { service, chatId } = await buildMessagesService();
      const sent = await service.sendMessage("alice", sendDto(chatId, "hi"));

      await expect(service.editMessage("bob", sent.id, "x")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("404s on a deleted message", async () => {
      const { service, chatId } = await buildMessagesService();
      const sent = await service.sendMessage("alice", sendDto(chatId, "hi"));
      await service.deleteMessage("alice", sent.id);

      await expect(service.editMessage("alice", sent.id, "x")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("setReaction (FR-MSG-13)", () => {
    it("adds a reaction and broadcasts message:updated to every member", async () => {
      const { service, chatId, emitted } = await buildMessagesService();
      const sent = await service.sendMessage("alice", sendDto(chatId, "hi"));

      const reacted = await service.setReaction("bob", sent.id, "👍");

      expect(reacted.reactions).toEqual([{ emoji: "👍", count: 1, userIds: ["bob"] }]);
      const updates = emitted.filter((e) => e.event === "message:updated");
      expect(updates.map((e) => e.room).sort()).toEqual(["user:alice", "user:bob"]);
    });

    it("replaces the user's previous reaction instead of stacking a second one", async () => {
      const { service, chatId } = await buildMessagesService();
      const sent = await service.sendMessage("alice", sendDto(chatId, "hi"));
      await service.setReaction("bob", sent.id, "👍");

      const reacted = await service.setReaction("bob", sent.id, "❤️");

      expect(reacted.reactions).toEqual([{ emoji: "❤️", count: 1, userIds: ["bob"] }]);
    });

    it("counts several users on the same emoji", async () => {
      const { service, chatId } = await buildMessagesService();
      const sent = await service.sendMessage("alice", sendDto(chatId, "hi"));
      await service.setReaction("alice", sent.id, "🔥");

      const reacted = await service.setReaction("bob", sent.id, "🔥");

      expect(reacted.reactions).toEqual([{ emoji: "🔥", count: 2, userIds: ["alice", "bob"] }]);
    });

    it("removes the reaction when cleared", async () => {
      const { service, chatId } = await buildMessagesService();
      const sent = await service.sendMessage("alice", sendDto(chatId, "hi"));
      await service.setReaction("bob", sent.id, "👍");

      const cleared = await service.setReaction("bob", sent.id, null);

      expect(cleared.reactions).toEqual([]);
    });

    it("rejects a user who isn't in the chat", async () => {
      const { service, chatId } = await buildMessagesService();
      const sent = await service.sendMessage("alice", sendDto(chatId, "hi"));

      await expect(service.setReaction("mallory", sent.id, "👍")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("rejects reacting once blocked, but still lets the user clear an earlier reaction", async () => {
      const { service, chatId, state } = await buildMessagesService();
      const sent = await service.sendMessage("alice", sendDto(chatId, "hi"));
      await service.setReaction("bob", sent.id, "👍");
      state.blocked = true;

      await expect(service.setReaction("bob", sent.id, "❤️")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const cleared = await service.setReaction("bob", sent.id, null);
      expect(cleared.reactions).toEqual([]);
    });

    it("404s on a deleted message", async () => {
      const { service, chatId } = await buildMessagesService();
      const sent = await service.sendMessage("alice", sendDto(chatId, "hi"));
      await service.deleteMessage("alice", sent.id);

      await expect(service.setReaction("bob", sent.id, "👍")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("deleteMessage (FR-MSG-06)", () => {
    it("soft-deletes own message and wipes its content", async () => {
      const { service, chatId, messages } = await buildMessagesService();
      const sent = await service.sendMessage("alice", sendDto(chatId, "secret"));

      await service.deleteMessage("alice", sent.id);

      const row = messages.get(sent.id);
      expect(row?.deletedAt).not.toBeNull();
      expect(row?.text).toBeNull();
    });

    it("rejects deleting someone else's message", async () => {
      const { service, chatId } = await buildMessagesService();
      const sent = await service.sendMessage("alice", sendDto(chatId, "hi"));

      await expect(service.deleteMessage("bob", sent.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
