import { createDecipheriv, randomBytes } from "node:crypto";

import { Test } from "@nestjs/testing";
import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../prisma/prisma.service";

import { FcmClient, type FcmSendResult } from "./fcm.client";
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

interface FakeDeviceRow {
  id: string;
  userId: string;
  deviceId: string;
  fcmToken: string;
  encKey: string;
}

const DEVICE_KEY = randomBytes(32);

function device(overrides: Partial<FakeDeviceRow> = {}): FakeDeviceRow {
  return {
    id: "dev-1",
    userId: "alice",
    deviceId: "7f0c2f4e-0000-4000-8000-0000000000d1",
    fcmToken: "fcm-token-1",
    encKey: DEVICE_KEY.toString("base64"),
    ...overrides,
  };
}

/** Opens what the worker encrypted for `device()` — what the Android app does. */
function decryptFor(row: FakeDeviceRow, data: Record<string, string>): unknown {
  const raw = Buffer.from(data.ct ?? "", "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(row.encKey, "base64"),
    Buffer.from(data.iv ?? "", "base64"),
  );
  decipher.setAAD(Buffer.from(row.deviceId));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(
    Buffer.concat([decipher.update(raw.subarray(0, raw.length - 16)), decipher.final()]).toString(),
  );
}

async function buildProcessor(
  subscriptions: FakeSubscriptionRow[],
  devices: FakeDeviceRow[] = [],
  fcmEnabled = true,
) {
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
  const deviceRows = new Map(devices.map((d) => [d.id, d]));
  const nativePushDevice = {
    findMany: ({ where }: { where: { userId: string } }) =>
      Promise.resolve([...deviceRows.values()].filter((r) => r.userId === where.userId)),
    update: vi.fn(() => Promise.resolve()),
    delete: vi.fn(({ where }: { where: { id: string } }) => {
      deviceRows.delete(where.id);
      return Promise.resolve();
    }),
  };
  const fcm = {
    enabled: fcmEnabled,
    send: vi.fn<(...args: unknown[]) => Promise<FcmSendResult>>(() => Promise.resolve("sent")),
  };
  const config = {
    vapid: { publicKey: "pub", privateKey: "priv", subject: "mailto:test@example.com" },
    jwt: { accessSecret: "s".repeat(32) },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      NotificationsProcessor,
      { provide: PrismaService, useValue: { pushSubscription, nativePushDevice } },
      { provide: AppConfigService, useValue: config },
      { provide: FcmClient, useValue: fcm },
    ],
  }).compile();

  return {
    processor: moduleRef.get(NotificationsProcessor),
    pushSubscription,
    rows,
    nativePushDevice,
    deviceRows,
    fcm,
  };
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
      job({ userId: "alice", payload: { kind: "call:closed", callId: "call-1", reason: "ended" } }),
    );

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends to every subscription and records a successful delivery", async () => {
    const { processor, pushSubscription } = await buildProcessor([
      { id: "sub-1", userId: "alice", endpoint: "https://push.example/1", p256dh: "p", auth: "a" },
    ]);
    sendNotification.mockResolvedValueOnce({ statusCode: 201, body: "", headers: {} });

    await processor.process(
      job({ userId: "alice", payload: { kind: "call:closed", callId: "call-1", reason: "ended" } }),
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
      job({ userId: "alice", payload: { kind: "call:closed", callId: "call-1", reason: "ended" } }),
    );

    expect(pushSubscription.delete).toHaveBeenCalledWith({ where: { id: "sub-1" } });
  });

  it("removes a subscription created under a rotated VAPID key (403)", async () => {
    const { processor, pushSubscription } = await buildProcessor([
      { id: "sub-1", userId: "alice", endpoint: "https://push.example/1", p256dh: "p", auth: "a" },
    ]);
    sendNotification.mockRejectedValueOnce(new WebPushError("key mismatch", 403));

    await processor.process(job({ userId: "alice", payload: { kind: "test" } }));

    expect(pushSubscription.delete).toHaveBeenCalledWith({ where: { id: "sub-1" } });
  });

  it("gives a missed call a full day TTL (so it still arrives late)", async () => {
    const { processor } = await buildProcessor([
      { id: "sub-1", userId: "alice", endpoint: "https://push.example/1", p256dh: "p", auth: "a" },
    ]);
    sendNotification.mockResolvedValueOnce({ statusCode: 201, body: "", headers: {} });

    await processor.process(
      job({
        userId: "alice",
        payload: {
          kind: "call:missed",
          call: {
            id: "call-1",
            chatId: "chat-1",
            callerId: "bob",
            calleeId: "alice",
            video: false,
            status: "missed",
            createdAt: new Date().toISOString(),
            answeredAt: null,
            endedAt: new Date().toISOString(),
            callerEndpointId: null,
            calleeEndpointId: null,
          },
          callerName: "Bob",
        },
      }),
    );

    expect(sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ TTL: 60 * 60 * 24, urgency: "normal" }),
    );
  });

  it("leaves the subscription in place on a transient failure", async () => {
    const { processor, pushSubscription } = await buildProcessor([
      { id: "sub-1", userId: "alice", endpoint: "https://push.example/1", p256dh: "p", auth: "a" },
    ]);
    sendNotification.mockRejectedValueOnce(new Error("network blip"));

    await processor.process(
      job({ userId: "alice", payload: { kind: "call:closed", callId: "call-1", reason: "ended" } }),
    );

    expect(pushSubscription.delete).not.toHaveBeenCalled();
  });

  describe("native (FCM) transport", () => {
    const webSub = {
      id: "sub-1",
      userId: "alice",
      endpoint: "https://push.example/1",
      p256dh: "p",
      auth: "a",
    };

    it("sends each device a payload encrypted with its own key", async () => {
      const row = device();
      const { processor, fcm, nativePushDevice } = await buildProcessor([], [row]);

      await processor.process(
        job({
          userId: "alice",
          payload: { kind: "call:closed", callId: "call-1", reason: "ended" },
        }),
      );

      expect(fcm.send).toHaveBeenCalledWith("fcm-token-1", expect.any(Object), {
        ttlSeconds: 60,
        priority: "HIGH",
      });
      const data = fcm.send.mock.calls[0]?.[1] as Record<string, string>;
      expect(decryptFor(row, data)).toEqual({
        kind: "call:closed",
        callId: "call-1",
        reason: "ended",
      });
      expect(nativePushDevice.update).toHaveBeenCalled();
    });

    it("removes a device FCM reports as unregistered", async () => {
      const { processor, fcm, deviceRows } = await buildProcessor([], [device()]);
      fcm.send.mockResolvedValueOnce("unregistered");

      await processor.process(job({ userId: "alice", payload: { kind: "test" } }));

      expect(deviceRows.size).toBe(0);
    });

    it("keeps the device on a transient FCM failure", async () => {
      const { processor, fcm, deviceRows } = await buildProcessor([], [device()]);
      fcm.send.mockRejectedValueOnce(new Error("network blip"));

      await processor.process(job({ userId: "alice", payload: { kind: "test" } }));

      expect(deviceRows.size).toBe(1);
    });

    it("sends native-only pushes (chat:read) to devices but never to Web Push", async () => {
      const { processor, fcm } = await buildProcessor([webSub], [device()]);

      await processor.process(
        job({ userId: "alice", payload: { kind: "chat:read", chatId: "chat-1", readSeq: "5" } }),
      );

      expect(sendNotification).not.toHaveBeenCalled();
      expect(fcm.send).toHaveBeenCalledWith("fcm-token-1", expect.any(Object), {
        ttlSeconds: 60 * 60 * 24,
        priority: "NORMAL",
      });
    });

    it("respects a job limited to the web transport (ring repeats)", async () => {
      const { processor, fcm } = await buildProcessor([webSub], [device()]);
      sendNotification.mockResolvedValueOnce({ statusCode: 201, body: "", headers: {} });

      await processor.process(
        job({ userId: "alice", payload: { kind: "test" }, transports: ["web"] }),
      );

      expect(sendNotification).toHaveBeenCalledTimes(1);
      expect(fcm.send).not.toHaveBeenCalled();
    });

    it("skips devices entirely when FCM isn't configured", async () => {
      const { processor, fcm } = await buildProcessor([], [device()], false);

      await processor.process(job({ userId: "alice", payload: { kind: "test" } }));

      expect(fcm.send).not.toHaveBeenCalled();
    });
  });
});
