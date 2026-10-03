import { randomUUID } from "node:crypto";

import { getQueueToken } from "@nestjs/bullmq";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppConfigService } from "../config/app-config.service";
import { CALLS_QUEUE } from "../jobs/calls.processor";
import { MessagesService } from "../messages/messages.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { ChatEventsGateway } from "../realtime/chat-events.gateway";
import { REDIS_CLIENT } from "../redis/redis.module";
import { UsersService } from "../users/users.service";

import { signDeclineToken } from "./call.util";
import { CallsService } from "./calls.service";

type CallStatus =
  "RINGING" | "ACTIVE" | "ENDED" | "MISSED" | "DECLINED" | "CANCELLED" | "BUSY" | "FAILED";

interface FakeCallRow {
  id: string;
  chatId: string;
  callerId: string;
  calleeId: string;
  video: boolean;
  status: CallStatus;
  createdAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
}

interface FakeChatRow {
  id: string;
  type: "DIRECT" | "SAVED";
  lastSeq: bigint;
}

const ACCESS_SECRET = "test-access-secret-at-least-32-bytes-long!!";

function buildFakeRedis() {
  const store = new Map<string, string>();
  return {
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    set: (key: string, value: string, ..._rest: unknown[]) => {
      const nx = _rest.includes("NX");
      if (nx && store.has(key)) return Promise.resolve(null);
      store.set(key, value);
      return Promise.resolve("OK");
    },
    del: (key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    },
    incr: (key: string) => {
      const next = Number(store.get(key) ?? "0") + 1;
      store.set(key, String(next));
      return Promise.resolve(next);
    },
    pexpire: () => Promise.resolve(1),
    store,
  };
}

function buildFakePrisma(chats: Map<string, FakeChatRow>, members: Map<string, string[]>) {
  const calls = new Map<string, FakeCallRow>();
  const users = new Map<string, { id: string; displayName: string }>();

  const call = {
    create: ({
      data,
    }: {
      data: Omit<FakeCallRow, "id" | "createdAt" | "answeredAt" | "endedAt">;
    }) => {
      const row: FakeCallRow = {
        id: randomUUID(),
        createdAt: new Date(),
        answeredAt: null,
        endedAt: null,
        ...data,
      };
      calls.set(row.id, row);
      return Promise.resolve(row);
    },
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(calls.get(where.id) ?? null),
    findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
      const row = calls.get(where.id);
      if (!row) throw new Error("call not found");
      return Promise.resolve(row);
    },
    findFirst: ({
      where,
    }: {
      where: {
        chatId?: string;
        status?: CallStatus | { in: CallStatus[] };
        callerId?: string;
        calleeId?: string;
        OR?: { callerId?: string; calleeId?: string }[];
      };
    }) => {
      const matchStatus = (s: CallStatus) =>
        typeof where.status === "string"
          ? s === where.status
          : (where.status?.in.includes(s) ?? true);
      const rows = [...calls.values()]
        .filter((r) => (where.chatId ? r.chatId === where.chatId : true))
        .filter((r) => matchStatus(r.status))
        .filter((r) => (where.callerId ? r.callerId === where.callerId : true))
        .filter((r) => (where.calleeId ? r.calleeId === where.calleeId : true))
        .filter((r) =>
          where.OR
            ? where.OR.some(
                (cond) =>
                  (!cond.callerId || r.callerId === cond.callerId) &&
                  (!cond.calleeId || r.calleeId === cond.calleeId),
              )
            : true,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return Promise.resolve(rows[0] ?? null);
    },
    updateMany: ({
      where,
      data,
    }: {
      where: { id: string; status: CallStatus | { in: CallStatus[] } };
      data: Partial<FakeCallRow>;
    }) => {
      const row = calls.get(where.id);
      if (!row) return Promise.resolve({ count: 0 });
      const matches =
        typeof where.status === "string"
          ? row.status === where.status
          : where.status.in.includes(row.status);
      if (!matches) return Promise.resolve({ count: 0 });
      calls.set(where.id, { ...row, ...data });
      return Promise.resolve({ count: 1 });
    },
    delete: ({ where }: { where: { id: string } }) => {
      calls.delete(where.id);
      return Promise.resolve();
    },
  };

  const chat = {
    findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
      const row = chats.get(where.id);
      if (!row) throw new Error("chat not found");
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: { lastSeq?: { increment: number } };
    }) => {
      const row = chats.get(where.id);
      if (!row) throw new Error("chat not found");
      const updated = { ...row, lastSeq: row.lastSeq + BigInt(data.lastSeq?.increment ?? 0) };
      chats.set(where.id, updated);
      return Promise.resolve(updated);
    },
  };

  const chatMember = {
    findUnique: ({ where }: { where: { chatId_userId: { chatId: string; userId: string } } }) => {
      const rows = members.get(where.chatId_userId.chatId) ?? [];
      const found = rows.includes(where.chatId_userId.userId);
      return Promise.resolve(
        found ? { chatId: where.chatId_userId.chatId, userId: where.chatId_userId.userId } : null,
      );
    },
    findFirst: ({ where }: { where: { chatId: string; userId: { not: string } } }) => {
      const rows = members.get(where.chatId) ?? [];
      const other = rows.find((userId) => userId !== where.userId.not);
      return Promise.resolve(other ? { chatId: where.chatId, userId: other } : null);
    },
  };

  const user = {
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(users.get(where.id) ?? null),
    findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
      const row = users.get(where.id);
      if (!row) throw new Error("user not found");
      return Promise.resolve(row);
    },
  };

  const prisma = { call, chat, chatMember, user };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for a $transaction callback taking the same shape as PrismaService
  (prisma as any).$transaction = (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma);

  return { prisma, calls, users };
}

async function buildCallsService(chatType: "DIRECT" | "SAVED" = "DIRECT") {
  const chats = new Map<string, FakeChatRow>();
  const members = new Map<string, string[]>();
  const chatId = "chat-1";
  chats.set(chatId, { id: chatId, type: chatType, lastSeq: 0n });
  members.set(chatId, chatType === "DIRECT" ? ["alice", "bob"] : ["alice"]);

  const { prisma, users } = buildFakePrisma(chats, members);
  users.set("alice", { id: "alice", displayName: "Alice" });
  users.set("bob", { id: "bob", displayName: "Bob" });

  const redis = buildFakeRedis();
  const emit = vi.fn();
  const fakeEvents = { server: { to: () => ({ emit }) } };
  const fakeUsers = { isBlockedEitherWay: vi.fn(() => Promise.resolve(false)) };
  const fakeMessages = { createCallMessage: vi.fn(() => Promise.resolve({})) };
  const fakeNotifications = {
    notifyCallIncoming: vi.fn(() => Promise.resolve()),
    notifyCallClosed: vi.fn(() => Promise.resolve()),
    notifyCallMissed: vi.fn(() => Promise.resolve()),
  };
  const fakeConfig = {
    livekit: {
      url: "ws://localhost:7880",
      apiUrl: "http://localhost:7880",
      apiKey: "devkey",
      apiSecret: "devkeysecretdevkeysecretdevkeysecret32",
    },
    jwt: { accessSecret: ACCESS_SECRET, refreshSecret: ACCESS_SECRET },
  };
  const fakeQueue = { add: vi.fn(() => Promise.resolve()) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      CallsService,
      { provide: PrismaService, useValue: prisma },
      { provide: UsersService, useValue: fakeUsers },
      { provide: MessagesService, useValue: fakeMessages },
      { provide: NotificationsService, useValue: fakeNotifications },
      { provide: ChatEventsGateway, useValue: fakeEvents },
      { provide: AppConfigService, useValue: fakeConfig },
      { provide: getQueueToken(CALLS_QUEUE), useValue: fakeQueue },
      { provide: REDIS_CLIENT, useValue: redis },
    ],
  }).compile();

  return {
    service: moduleRef.get(CallsService),
    chatId,
    redis,
    emit,
    fakeMessages,
    fakeNotifications,
    fakeQueue,
    fakeUsers,
  };
}

describe("CallsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("start", () => {
    it("creates a ringing call, notifies the callee, schedules the ring timeout, and joins the caller", async () => {
      const { service, chatId, emit, fakeNotifications, fakeQueue } = await buildCallsService();

      const join = await service.start("alice", { chatId, video: false });

      expect(join.call.status).toBe("ringing");
      expect(join.call.callerId).toBe("alice");
      expect(join.call.calleeId).toBe("bob");
      expect(join.livekitUrl).toBeTruthy();
      expect(join.token).toBeTruthy();
      expect(emit).toHaveBeenCalledWith(
        "call:incoming",
        expect.objectContaining({ id: join.call.id }),
      );
      expect(fakeNotifications.notifyCallIncoming).toHaveBeenCalledWith(
        expect.objectContaining({ id: join.call.id }),
        expect.objectContaining({ displayName: "Alice" }),
      );
      expect(fakeQueue.add).toHaveBeenCalledWith(
        "ring-timeout",
        { callId: join.call.id },
        expect.objectContaining({ delay: 45_000 }),
      );
    });

    it("schedules 10 ring-repeat jobs, 4s apart, each with its own idempotent jobId", async () => {
      const { service, chatId, fakeQueue } = await buildCallsService();

      const join = await service.start("alice", { chatId, video: false });

      const calls = fakeQueue.add.mock.calls as unknown as [
        string,
        { callId: string },
        { delay: number; jobId: string },
      ][];
      const repeatCalls = calls.filter(([name]) => name === "ring-repeat");
      expect(repeatCalls).toHaveLength(10);
      repeatCalls.forEach(([, data, opts], index) => {
        const attempt = index + 1;
        expect(data).toEqual({ callId: join.call.id });
        expect(opts).toMatchObject({
          delay: 4_000 * attempt,
          jobId: `ring-repeat-${join.call.id}-${String(attempt)}`,
        });
      });
    });

    it("uses a BullMQ-safe jobId (no colons)", async () => {
      const { service, chatId, fakeQueue } = await buildCallsService();

      const join = await service.start("alice", { chatId, video: false });

      const [, , opts] = fakeQueue.add.mock.calls[0] as unknown as [
        string,
        unknown,
        { jobId: string },
      ];
      expect(opts.jobId).not.toContain(":");
      expect(opts.jobId).toBe(`ring-timeout-${join.call.id}`);
    });

    it("rejects calling a blocked user", async () => {
      const { service, chatId, fakeUsers } = await buildCallsService();
      fakeUsers.isBlockedEitherWay.mockResolvedValueOnce(true);

      await expect(service.start("alice", { chatId, video: false })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("409s when either party is already on a call (busy)", async () => {
      const { service, chatId, redis } = await buildCallsService();
      await redis.set("call:busy:bob", "some-other-call", "PX", 1000, "NX");

      await expect(service.start("alice", { chatId, video: false })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("glare: accepts the callee's already-ringing call instead of creating a second one", async () => {
      const { service, chatId } = await buildCallsService();
      const reverse = await service.start("bob", { chatId, video: false });

      const result = await service.start("alice", { chatId, video: false });

      expect(result.call.id).toBe(reverse.call.id);
      expect(result.call.callerId).toBe("bob");
      expect(result.call.status).toBe("active");
      expect(result.token).toBeTruthy();
    });

    it("rejects calls in a non-direct chat", async () => {
      const { service, chatId } = await buildCallsService("SAVED");

      await expect(service.start("alice", { chatId, video: false })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("on failure after the row is created, marks the call FAILED and releases both locks", async () => {
      const { service, chatId, redis, fakeQueue } = await buildCallsService();
      fakeQueue.add.mockRejectedValueOnce(new Error("queue unavailable"));

      await expect(service.start("alice", { chatId, video: false })).rejects.toThrow(
        "queue unavailable",
      );

      expect(redis.store.has("call:busy:alice")).toBe(false);
      expect(redis.store.has("call:busy:bob")).toBe(false);

      // A retried start should succeed cleanly — no orphan RINGING row left locking things up.
      const retried = await service.start("alice", { chatId, video: false });
      expect(retried.call.status).toBe("ringing");
    });
  });

  describe("accept", () => {
    it("transitions RINGING -> ACTIVE and is idempotent on a second call", async () => {
      const { service, chatId, fakeNotifications } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });

      const first = await service.accept("bob", started.call.id);
      const second = await service.accept("bob", started.call.id);

      expect(first.call.status).toBe("active");
      expect(second.call.status).toBe("active");
      expect(first.call.answeredAt).toBe(second.call.answeredAt);
      expect(fakeNotifications.notifyCallClosed).toHaveBeenCalledTimes(1);
      expect(fakeNotifications.notifyCallClosed).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" }),
        "answered-elsewhere",
      );
    });

    it("only the callee can accept", async () => {
      const { service, chatId } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });

      await expect(service.accept("alice", started.call.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("404s for an unknown call id", async () => {
      const { service } = await buildCallsService();
      await expect(service.accept("bob", randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("decline / cancel / hangup", () => {
    it("decline: only the callee can decline, writes a history message, and is idempotent", async () => {
      const { service, chatId, fakeMessages, fakeNotifications } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });

      await expect(service.decline("alice", started.call.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      const first = await service.decline("bob", started.call.id);
      const second = await service.decline("bob", started.call.id);

      expect(first.status).toBe("declined");
      expect(second.status).toBe("declined");
      expect(fakeMessages.createCallMessage).toHaveBeenCalledTimes(1);
      expect(fakeNotifications.notifyCallClosed).toHaveBeenCalledTimes(1);
      expect(fakeNotifications.notifyCallClosed).toHaveBeenCalledWith(
        expect.objectContaining({ status: "declined" }),
        "ended",
      );
    });

    it("cancel: only the caller can cancel a ringing call", async () => {
      const { service, chatId } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });

      await expect(service.cancel("bob", started.call.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      const cancelled = await service.cancel("alice", started.call.id);
      expect(cancelled.status).toBe("cancelled");
    });

    it("hangup: either party can end an active call, and a history message reports it", async () => {
      const { service, chatId, fakeMessages, fakeNotifications } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });
      await service.accept("bob", started.call.id);
      fakeNotifications.notifyCallClosed.mockClear();

      const ended = await service.hangup("alice", started.call.id);

      expect(ended.status).toBe("ended");
      expect(fakeMessages.createCallMessage).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ENDED", chatId, callerId: "alice" }),
      );
      expect(fakeNotifications.notifyCallClosed).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ended" }),
        "ended",
      );
    });

    it("hangup: the caller hanging up before an answer cancels the call", async () => {
      const { service, chatId } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });

      const result = await service.hangup("alice", started.call.id);

      expect(result.status).toBe("cancelled");
    });

    it("hangup: the callee hanging up before answering declines the call", async () => {
      const { service, chatId } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });

      const result = await service.hangup("bob", started.call.id);

      expect(result.status).toBe("declined");
    });

    it("declineWithToken: rejects an invalid signature and accepts a valid one", async () => {
      const { service, chatId } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });

      await expect(
        service.declineWithToken(started.call.id, "not-a-real-token"),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const token = signDeclineToken(ACCESS_SECRET, started.call.id);
      const declined = await service.declineWithToken(started.call.id, token);
      expect(declined.status).toBe("declined");
    });
  });

  describe("getActive", () => {
    it("returns null when the user has no non-terminal call", async () => {
      const { service } = await buildCallsService();
      await expect(service.getActive("alice")).resolves.toBeNull();
    });

    it("gives the callee of a still-ringing call the call info but no token", async () => {
      const { service, chatId } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });

      const active = await service.getActive("bob");

      expect(active?.call.id).toBe(started.call.id);
      expect(active?.call.status).toBe("ringing");
      expect(active?.token).toBeNull();
    });

    it("gives the caller of a still-ringing call a full join", async () => {
      const { service, chatId } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });

      const active = await service.getActive("alice");

      expect(active?.call.id).toBe(started.call.id);
      expect(active?.token).toBeTruthy();
    });

    it("gives either party of an active call a full join", async () => {
      const { service, chatId } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });
      await service.accept("bob", started.call.id);

      const forCaller = await service.getActive("alice");
      const forCallee = await service.getActive("bob");

      expect(forCaller?.token).toBeTruthy();
      expect(forCallee?.token).toBeTruthy();
    });
  });

  describe("applyWebhookEvent", () => {
    it("ends an active call on participant_left", async () => {
      const { service, chatId, fakeMessages } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });
      await service.accept("bob", started.call.id);

      await service.applyWebhookEvent("participant_left", `call:${started.call.id}`);

      expect(fakeMessages.createCallMessage).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ENDED", chatId, callerId: "alice" }),
      );
    });

    it("ignores events for a call that isn't active (e.g. still ringing)", async () => {
      const { service, chatId, fakeMessages } = await buildCallsService();
      const started = await service.start("alice", { chatId, video: false });

      await service.applyWebhookEvent("room_finished", `call:${started.call.id}`);

      expect(fakeMessages.createCallMessage).not.toHaveBeenCalled();
    });

    it("ignores a room name that isn't a call room", async () => {
      const { service, fakeMessages } = await buildCallsService();
      await service.applyWebhookEvent("participant_left", "not-a-call-room");
      expect(fakeMessages.createCallMessage).not.toHaveBeenCalled();
    });
  });
});
