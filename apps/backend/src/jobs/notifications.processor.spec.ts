import { Test } from "@nestjs/testing";
import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../prisma/prisma.service";

import { NotificationsProcessor, type NotificationJobData } from "./notifications.processor";

const { sendNotification, setVapidDetails, WebPushError } = vi.hoisted(() => {
  class WebPushError extends Error {
    constructor(
      message: string,
      public statusCode: number,
    ) {
      super(message);
    }
  }
  return {
    sendNotification: vi.fn(),
    setVapidDetails: vi.fn(),
    WebPushError,
  };
});

vi.mock("web-push", () => ({ sendNotification, setVapidDetails, WebPushError }));

interface FakeSubscriptionRow {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function buildProcessor(subscriptions: FakeSubscriptionRow[]) {
  const rows = new Map(subscriptions.map((s) => [s.id, s]));
  const pushSubscription = {
    findMany: ({ where }: { where: { userId: string } }) =>
      Promise.resolve([...rows.values()].filter((r) => r.userId === where.userId)),
    update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = rows.get(where.id);
      if (existing) rows.set(where.id, { ...existing, ...data });
      return Promise.resolve();
    }),
    delete: vi.fn(({ where }: { where: { id: string } }) => {
      rows.delete(where.id);
      return Promise.resolve();
    }),
  };
  const config = {
    vapid: { publicKey: "pub", privateKey: "priv", subject: "mailto:test@example.com" },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      NotificationsProcessor,
      { provide: PrismaService, useValue: { pushSubscription } },
      { provide: AppConfigService, useValue: config },
    ],
  }).compile();

  return { processor: moduleRef.get(NotificationsProcessor), pushSubscription, rows };
}

function job(data: NotificationJobData): Job<NotificationJobData> {
  return { data } as Job<NotificationJobData>;
}

describe("NotificationsProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when the recipient has no push subscriptions", async () => {
    const { processor } = await buildProcessor([]);

    await processor.process(
      job({ userId: "alice", payload: { kind: "call:closed", callId: "call-1" } }),
    );

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends to every subscription and records a successful delivery", async () => {
    const { processor, pushSubscription } = await buildProcessor([
      { id: "sub-1", userId: "alice", endpoint: "https://push.example/1", p256dh: "p", auth: "a" },
    ]);
    sendNotification.mockResolvedValueOnce({ statusCode: 201, body: "", headers: {} });

    await processor.process(
      job({ userId: "alice", payload: { kind: "call:closed", callId: "call-1" } }),
    );

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(pushSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1" },
        data: expect.objectContaining({ lastSuccessAt: expect.any(Date) }),
      }),
    );
  });

  it("removes a subscription the push service reports as gone (410)", async () => {
    const { processor, pushSubscription } = await buildProcessor([
      { id: "sub-1", userId: "alice", endpoint: "https://push.example/1", p256dh: "p", auth: "a" },
    ]);
    sendNotification.mockRejectedValueOnce(new WebPushError("gone", 410));

    await processor.process(
      job({ userId: "alice", payload: { kind: "call:closed", callId: "call-1" } }),
    );

    expect(pushSubscription.delete).toHaveBeenCalledWith({ where: { id: "sub-1" } });
  });

  it("leaves the subscription in place on a transient failure", async () => {
    const { processor, pushSubscription } = await buildProcessor([
      { id: "sub-1", userId: "alice", endpoint: "https://push.example/1", p256dh: "p", auth: "a" },
    ]);
    sendNotification.mockRejectedValueOnce(new Error("network blip"));

    await processor.process(
      job({ userId: "alice", payload: { kind: "call:closed", callId: "call-1" } }),
    );

    expect(pushSubscription.delete).not.toHaveBeenCalled();
  });
});
