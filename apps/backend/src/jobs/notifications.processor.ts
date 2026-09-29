import type { PushPayload } from "@ghostline/contracts";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { sendNotification, setVapidDetails, WebPushError, type Urgency } from "web-push";

import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../prisma/prisma.service";

export const NOTIFICATIONS_QUEUE = "notifications";

export interface NotificationJobData {
  /** Recipient — never the sender/actor who caused this notification. */
  userId: string;
  payload: PushPayload;
}

/** FR-NOTIF-04/05: messages get a full day to arrive, calls need to ring *now* or not at all. */
function pushOptionsFor(payload: PushPayload): { ttl: number; urgency: Urgency } {
  switch (payload.kind) {
    case "call:incoming":
      return { ttl: 45, urgency: "high" };
    case "message":
      return { ttl: 60 * 60 * 24, urgency: "normal" };
    case "call:closed":
      return { ttl: 60, urgency: "normal" };
    case "call:missed":
      return { ttl: 60 * 60 * 24, urgency: "normal" };
  }
}

/**
 * Sends one Web Push message per `PushSubscription` a recipient has
 * registered (one per browser/device). A subscription the push service no
 * longer recognises (404/410 — the user uninstalled, cleared storage, or
 * the browser rotated it) is removed so future notifications don't keep
 * paying for a dead endpoint (docs/adr/0010).
 */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {
    super();
    const { subject, publicKey, privateKey } = this.config.vapid;
    setVapidDetails(subject, publicKey, privateKey);
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const { userId, payload } = job.data;
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length === 0) return;

    const { ttl, urgency } = pushOptionsFor(payload);
    const body = JSON.stringify(payload);

    await Promise.all(subscriptions.map((sub) => this.sendOne(sub, body, ttl, urgency)));
  }

  private async sendOne(
    sub: { id: string; endpoint: string; p256dh: string; auth: string },
    body: string,
    ttl: number,
    urgency: Urgency,
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
      if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        return;
      }
      this.logger.warn(`push to subscription ${sub.id} failed: ${String(error)}`);
    }
  }
}
