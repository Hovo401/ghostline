import { randomUUID } from "node:crypto";

import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import { AppConfigService } from "../config/app-config.service";
import { NOTIFICATIONS_QUEUE } from "../jobs/notifications.processor";
import { PrismaService } from "../prisma/prisma.service";

import { NotificationsService } from "./notifications.service";

interface FakeMemberRow {
  chatId: string;
  userId: string;
  muted: boolean;
  notifyMessages: boolean;
  notifyPreview: boolean;
}

function fakeMessage() {
  return {
    id: randomUUID(),
    chatId: "chat-1",
    seq: 1n,
    senderId: "alice",
    clientMessageId: randomUUID(),
    type: "text" as const,
    text: "hi",
    attachmentId: null,
    attachment: null,
    durationMs: null,
    waveform: null,
    replyToId: null,
    call: null,
    status: "sent" as const,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };
}

async function buildService(members: FakeMemberRow[]) {
  const chatMember = {
    findMany: ({ where }: { where: { chatId: string; userId: { not: string }; muted: boolean } }) =>
      Promise.resolve(
        members
          .filter(
            (m) =>
              m.chatId === where.chatId && m.userId !== where.userId.not && m.muted === where.muted,
          )
          .map((m) => ({
            userId: m.userId,
            user: { notifyMessages: m.notifyMessages, notifyPreview: m.notifyPreview },
          })),
      ),
  };
  const user = {
    findUnique: ({ where }: { where: { id: string } }) => {
      const m = members.find((row) => row.userId === where.id);
      return Promise.resolve(m ? { notifyCalls: true } : null);
    },
    findUniqueOrThrow: () =>
      Promise.resolve({ notifyMessages: true, notifyCalls: true, notifyPreview: true }),
    update: (args: { data: Record<string, boolean> }) =>
      Promise.resolve({
        notifyMessages: true,
        notifyCalls: true,
        notifyPreview: true,
        ...args.data,
      }),
  };
  const pushSubscription = {
    upsert: vi.fn(() => Promise.resolve()),
    deleteMany: vi.fn(() => Promise.resolve({ count: 1 })),
  };
  const prisma = { chatMember, user, pushSubscription };
  const config = {
    vapid: { publicKey: "pub", privateKey: "priv", subject: "mailto:test@example.com" },
    jwt: { accessSecret: "a".repeat(32), refreshSecret: "b".repeat(32) },
  };
  const add = vi.fn(() => Promise.resolve());

  const moduleRef = await Test.createTestingModule({
    providers: [
      NotificationsService,
      { provide: PrismaService, useValue: prisma },
      { provide: AppConfigService, useValue: config },
      { provide: getQueueToken(NOTIFICATIONS_QUEUE), useValue: { add } },
    ],
  }).compile();

  return { service: moduleRef.get(NotificationsService), add, pushSubscription };
}

describe("NotificationsService", () => {
  describe("notifyNewMessage", () => {
    it("enqueues a push for an unmuted recipient with notifications on", async () => {
      const { service, add } = await buildService([
        {
          chatId: "chat-1",
          userId: "bob",
          muted: false,
          notifyMessages: true,
          notifyPreview: true,
        },
      ]);

      await service.notifyNewMessage({
        chatId: "chat-1",
        chatTitle: "Alice",
        message: fakeMessage(),
        senderId: "alice",
      });

      expect(add).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenCalledWith(
        "push",
        expect.objectContaining({
          userId: "bob",
          payload: expect.objectContaining({ kind: "message" }),
        }),
      );
    });

    it("skips a recipient with notifyMessages off", async () => {
      const { service, add } = await buildService([
        {
          chatId: "chat-1",
          userId: "bob",
          muted: false,
          notifyMessages: false,
          notifyPreview: true,
        },
      ]);

      await service.notifyNewMessage({
        chatId: "chat-1",
        chatTitle: "Alice",
        message: fakeMessage(),
        senderId: "alice",
      });

      expect(add).not.toHaveBeenCalled();
    });

    it("skips a muted chat member entirely (never queried past the muted:false filter)", async () => {
      const { service, add } = await buildService([
        { chatId: "chat-1", userId: "bob", muted: true, notifyMessages: true, notifyPreview: true },
      ]);

      await service.notifyNewMessage({
        chatId: "chat-1",
        chatTitle: "Alice",
        message: fakeMessage(),
        senderId: "alice",
      });

      expect(add).not.toHaveBeenCalled();
    });

    it("sets preview:false in the payload when the recipient has previews off", async () => {
      const { service, add } = await buildService([
        {
          chatId: "chat-1",
          userId: "bob",
          muted: false,
          notifyMessages: true,
          notifyPreview: false,
        },
      ]);

      await service.notifyNewMessage({
        chatId: "chat-1",
        chatTitle: "Alice",
        message: fakeMessage(),
        senderId: "alice",
      });

      expect(add).toHaveBeenCalledWith(
        "push",
        expect.objectContaining({ payload: expect.objectContaining({ preview: false }) }),
      );
    });

    it("never enqueues a push for the sender", async () => {
      const { service, add } = await buildService([
        {
          chatId: "chat-1",
          userId: "alice",
          muted: false,
          notifyMessages: true,
          notifyPreview: true,
        },
      ]);

      await service.notifyNewMessage({
        chatId: "chat-1",
        chatTitle: "Alice",
        message: fakeMessage(),
        senderId: "alice",
      });

      expect(add).not.toHaveBeenCalled();
    });
  });

  describe("notifyCallClosed", () => {
    it("passes the reason through to the payload", async () => {
      const { service, add } = await buildService([]);
      const call = {
        id: "call-1",
        chatId: "chat-1",
        callerId: "alice",
        calleeId: "bob",
        video: false,
        status: "declined" as const,
        createdAt: new Date().toISOString(),
        answeredAt: null,
        endedAt: new Date().toISOString(),
      };

      await service.notifyCallClosed(call, "ended");

      expect(add).toHaveBeenCalledWith("push", {
        userId: "bob",
        payload: { kind: "call:closed", callId: "call-1", reason: "ended" },
      });

      await service.notifyCallClosed(call, "answered-elsewhere");

      expect(add).toHaveBeenCalledWith("push", {
        userId: "bob",
        payload: { kind: "call:closed", callId: "call-1", reason: "answered-elsewhere" },
      });
    });
  });

  describe("subscribe / unsubscribe", () => {
    it("upserts by endpoint", async () => {
      const { service, pushSubscription } = await buildService([]);

      await service.subscribe(
        "alice",
        { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } },
        "test-agent",
      );

      expect(pushSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { endpoint: "https://push.example/abc" } }),
      );
    });

    it("scopes deletion to the requesting user", async () => {
      const { service, pushSubscription } = await buildService([]);

      await service.unsubscribe("alice", "https://push.example/abc");

      expect(pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { userId: "alice", endpoint: "https://push.example/abc" },
      });
    });
  });
});
