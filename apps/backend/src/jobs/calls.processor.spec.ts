import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";
import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeEmitter } from "../realtime/realtime-emitter";
import { StorageService } from "../storage/storage.service";

import { CallRingTimeoutProcessor, type CallRingTimeoutJobData } from "./calls.processor";
import { NOTIFICATIONS_QUEUE } from "./notifications.processor";

const ACCESS_SECRET = "test-access-secret-at-least-32-bytes-long!!";

interface FakeCallRow {
  id: string;
  chatId: string;
  callerId: string;
  calleeId: string;
  video: boolean;
  status: "RINGING" | "ACTIVE" | "ENDED" | "MISSED" | "DECLINED" | "CANCELLED";
  createdAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
}

async function buildProcessor(call: FakeCallRow, notifyCalls = true) {
  const prisma = {
    call: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === call.id ? call : null),
      ),
    },
    user: {
      findUnique: vi.fn(() => Promise.resolve({ notifyCalls })),
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ displayName: "Alice" })),
    },
  };
  const config = { jwt: { accessSecret: ACCESS_SECRET, refreshSecret: ACCESS_SECRET } };
  const notificationsQueue = { add: vi.fn(() => Promise.resolve()) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      CallRingTimeoutProcessor,
      { provide: PrismaService, useValue: prisma },
      { provide: StorageService, useValue: {} },
      { provide: RealtimeEmitter, useValue: {} },
      { provide: AppConfigService, useValue: config },
      { provide: getQueueToken(NOTIFICATIONS_QUEUE), useValue: notificationsQueue },
    ],
  }).compile();

  return { processor: moduleRef.get(CallRingTimeoutProcessor), notificationsQueue };
}

function job(name: string, data: CallRingTimeoutJobData): Job<CallRingTimeoutJobData> {
  return { name, data } as Job<CallRingTimeoutJobData>;
}

describe("CallRingTimeoutProcessor — ring-repeat", () => {
  it("is a no-op when the call is no longer RINGING (already answered/declined/cancelled)", async () => {
    const call: FakeCallRow = {
      id: "call-1",
      chatId: "chat-1",
      callerId: "alice",
      calleeId: "bob",
      video: false,
      status: "ACTIVE",
      createdAt: new Date(),
      answeredAt: new Date(),
      endedAt: null,
    };
    const { processor, notificationsQueue } = await buildProcessor(call);

    await processor.process(job("ring-repeat", { callId: call.id }));

    expect(notificationsQueue.add).not.toHaveBeenCalled();
  });

  it("re-sends a call:incoming push while the call is still RINGING", async () => {
    const call: FakeCallRow = {
      id: "call-1",
      chatId: "chat-1",
      callerId: "alice",
      calleeId: "bob",
      video: false,
      status: "RINGING",
      createdAt: new Date(),
      answeredAt: null,
      endedAt: null,
    };
    const { processor, notificationsQueue } = await buildProcessor(call);

    await processor.process(job("ring-repeat", { callId: call.id }));

    expect(notificationsQueue.add).toHaveBeenCalledWith(
      "push",
      expect.objectContaining({
        userId: "bob",
        payload: expect.objectContaining({ kind: "call:incoming", callerName: "Alice" }),
      }),
    );
  });

  it("skips the repeat push when the callee has calls muted", async () => {
    const call: FakeCallRow = {
      id: "call-1",
      chatId: "chat-1",
      callerId: "alice",
      calleeId: "bob",
      video: false,
      status: "RINGING",
      createdAt: new Date(),
      answeredAt: null,
      endedAt: null,
    };
    const { processor, notificationsQueue } = await buildProcessor(call, false);

    await processor.process(job("ring-repeat", { callId: call.id }));

    expect(notificationsQueue.add).not.toHaveBeenCalled();
  });
});
