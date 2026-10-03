import type { PushPayload } from "@ghostline/contracts";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { sendNotification, setVapidDetails, WebPushError, type Urgency } from "web-push";

import { AppConfigService } from "../config/app-config.service";
import { signChatActionToken } from "../notifications/action-token";
import { PrismaService } from "../prisma/prisma.service";

import { FcmClient, type FcmSendOptions } from "./fcm.client";
import { encryptNativePush, toNativePush, type NativeOnlyPush } from "./native-push";

export const NOTIFICATIONS_QUEUE = "notifications";

/** Web Push to browsers/PWAs (docs/adr/0010), FCM to the Android app (docs/adr/0017). */
export type PushTransport = "web" | "native";

export interface NotificationJobData {
  /** Recipient — never the sender/actor who caused this notification. */
  userId: string;
  payload: PushPayload | NativeOnlyPush;
  /** Omitted: every transport the payload kind supports. */
  transports?: PushTransport[];
}

interface DeliveryOptions {
  ttl: number;
  urgency: Urgency;
  fcmPriority: FcmSendOptions["priority"];
}

/** FR-NOTIF-04/05: messages get a full day to arrive, calls need to ring *now* or not at all. */
function deliveryOptionsFor(payload: PushPayload | NativeOnlyPush): DeliveryOptions {
  switch (payload.kind) {
    case "call:incoming":
      return { ttl: 45, urgency: "high", fcmPriority: "HIGH" };
    case "message":
      return { ttl: 60 * 60 * 24, urgency: "normal", fcmPriority: "HIGH" };
    case "call:closed":
      // HIGH on FCM: a phone still ringing must stop right away.
      return { ttl: 60, urgency: "normal", fcmPriority: "HIGH" };
    case "test":
    case "test-call":
      return { ttl: 60, urgency: "high", fcmPriority: "HIGH" };
    case "call:missed":
      return { ttl: 60 * 60 * 24, urgency: "normal", fcmPriority: "NORMAL" };
    case "chat:read":
      // Shows nothing, so NORMAL — FCM deprioritizes HIGH pushes that never notify.
      return { ttl: 60 * 60 * 24, urgency: "normal", fcmPriority: "NORMAL" };
  }
}

function isNativeOnly(payload: PushPayload | NativeOnlyPush): payload is NativeOnlyPush {
  return payload.kind === "chat:read" || payload.kind === "test-call";
}

/**
 * Delivers one authored push to every device a recipient has registered:
 * one Web Push message per `PushSubscription` (browser/PWA) and one
 * encrypted FCM data message per `NativePushDevice` (Android app). Endpoints
 * the push service reports dead are removed so future notifications don't
 * keep paying for them (docs/adr/0010, 0017).
 */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly fcm: FcmClient,
  ) {
    super();
    const { subject, publicKey, privateKey } = this.config.vapid;
    setVapidDetails(subject, publicKey, privateKey);
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const { userId, payload, transports = ["web", "native"] } = job.data;
    const options = deliveryOptionsFor(payload);

    await Promise.all([
      transports.includes("web") && !isNativeOnly(payload)
        ? this.sendWeb(userId, payload, options)
        : undefined,
      transports.includes("native") && this.fcm.enabled
        ? this.sendNative(userId, payload, options)
        : undefined,
    ]);
  }

  private async sendWeb(
    userId: string,
    payload: PushPayload,
    options: DeliveryOptions,
  ): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.all(subscriptions.map((sub) => this.sendWebOne(sub, body, options)));
  }

  private async sendWebOne(
    sub: { id: string; endpoint: string; p256dh: string; auth: string },
    body: string,
    { ttl, urgency }: DeliveryOptions,
  ): Promise<void> {
    try {
      await sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: ttl, urgency },
      );
      await this.prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastSuccessAt: new Date() },
      });
    } catch (error) {
      // 404/410: the browser dropped this subscription. 403: it was created
      // with a different VAPID key (the key was rotated) and can never be
      // delivered again. Either way the page re-registers a fresh one on its
      // next load (`use-push-subscription.ts`), so deleting is safe.
      if (error instanceof WebPushError && [403, 404, 410].includes(error.statusCode)) {
        this.logger.warn(
          `push subscription ${sub.id} rejected (${String(error.statusCode)}) — removed`,
        );
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        return;
      }
      this.logger.warn(`push to subscription ${sub.id} failed: ${String(error)}`);
    }
  }

  private async sendNative(
    userId: string,
    payload: PushPayload | NativeOnlyPush,
    { ttl, fcmPriority }: DeliveryOptions,
  ): Promise<void> {
    const devices = await this.prisma.nativePushDevice.findMany({ where: { userId } });
    if (devices.length === 0) return;

    const native = toNativePush(payload, (chatId) =>
      signChatActionToken(this.config.jwt.accessSecret, userId, chatId),
    );
    await Promise.all(
      devices.map(async (device) => {
        const envelope = encryptNativePush(native, device.encKey, device.deviceId);
        const result = await this.fcm
          .send(device.fcmToken, envelope, { ttlSeconds: ttl, priority: fcmPriority })
          .catch((error: unknown) => {
            this.logger.warn(`FCM push to device ${device.id} failed: ${String(error)}`);
            return "failed" as const;
          });
        if (result === "sent") {
          await this.prisma.nativePushDevice.update({
            where: { id: device.id },
            data: { lastSuccessAt: new Date() },
          });
        } else if (result === "unregistered") {
          // The app was uninstalled or its token rotated; the app re-registers
          // a fresh token itself on its next start.
          this.logger.warn(`native push device ${device.id} unregistered — removed`);
          await this.prisma.nativePushDevice
            .delete({ where: { id: device.id } })
            .catch(() => undefined);
        }
      }),
    );
  }
}
