import type {
  Call,
  Message,
  NotificationSettings,
  PushSubscriptionBody,
} from "@ghostline/contracts";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

import { signDeclineToken } from "../calls/call.util";
import { AppConfigService } from "../config/app-config.service";
import { NOTIFICATIONS_QUEUE, type NotificationJobData } from "../jobs/notifications.processor";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Producer side of Web Push (docs/adr/0010) — decides *who* gets a
 * notification and builds the payload; `NotificationsProcessor` (worker)
 * decides *how* to deliver it to each of that user's subscribed devices.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue<NotificationJobData>,
  ) {}

  getVapidPublicKey(): string {
    return this.config.vapid.publicKey;
  }

  /** Upsert by `endpoint` — re-subscribing (e.g. after the browser rotates it) just refreshes the keys. */
  async subscribe(
    userId: string,
    body: PushSubscriptionBody,
    userAgent: string | undefined,
  ): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent,
      },
      update: { userId, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent },
    });
  }

  /** Scoped to `userId` so one device can't unsubscribe another user's endpoint. */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async getSettings(userId: string): Promise<NotificationSettings> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { notifyMessages: true, notifyCalls: true, notifyPreview: true },
    });
    return { messages: user.notifyMessages, calls: user.notifyCalls, preview: user.notifyPreview };
  }

  async updateSettings(
    userId: string,
    patch: Partial<NotificationSettings>,
  ): Promise<NotificationSettings> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.messages !== undefined ? { notifyMessages: patch.messages } : {}),
        ...(patch.calls !== undefined ? { notifyCalls: patch.calls } : {}),
        ...(patch.preview !== undefined ? { notifyPreview: patch.preview } : {}),
      },
      select: { notifyMessages: true, notifyCalls: true, notifyPreview: true },
    });
    return {
      messages: updated.notifyMessages,
      calls: updated.notifyCalls,
      preview: updated.notifyPreview,
    };
  }

  /**
   * FR-NOTIF-04: one push per other chat member, minus anyone muted or
   * with `notifyMessages` off — cheap to filter here since `pushChatUpdated`
   * (messages.service.ts) already needs this same membership query shape.
   * `preview: false` per-recipient tells the service worker to show a
   * generic "New message" instead of `message.text`.
   */
  async notifyNewMessage(params: {
    chatId: string;
    chatTitle: string;
    message: Message;
    senderId: string;
  }): Promise<void> {
    const members = await this.prisma.chatMember.findMany({
      where: { chatId: params.chatId, userId: { not: params.senderId }, muted: false },
      include: { user: { select: { notifyMessages: true, notifyPreview: true } } },
    });

    for (const member of members) {
      if (!member.user.notifyMessages) continue;
      await this.queue.add("push", {
        userId: member.userId,
        payload: {
          kind: "message",
          chatId: params.chatId,
          chatTitle: params.chatTitle,
          message: params.message,
          preview: member.user.notifyPreview,
        },
      });
    }
  }

  /** Skipped entirely (no job enqueued) when the callee has calls muted (`notifyCalls: false`). */
  async notifyCallIncoming(call: Call, callerName: string): Promise<void> {
    if (!(await this.calleeWantsCallPush(call.calleeId))) return;
    await this.queue.add("push", {
      userId: call.calleeId,
      payload: {
        kind: "call:incoming",
        call,
        callerName,
        declineToken: signDeclineToken(this.config.jwt.accessSecret, call.id),
      },
    });
  }

  /** Tells the callee's devices to dismiss any `call:incoming` notification still showing. */
  async notifyCallClosed(call: Call): Promise<void> {
    await this.queue.add("push", {
      userId: call.calleeId,
      payload: { kind: "call:closed", callId: call.id },
    });
  }

  async notifyCallMissed(call: Call, callerName: string): Promise<void> {
    if (!(await this.calleeWantsCallPush(call.calleeId))) return;
    await this.queue.add("push", {
      userId: call.calleeId,
      payload: { kind: "call:missed", call, callerName },
    });
  }

  private async calleeWantsCallPush(calleeId: string): Promise<boolean> {
    const callee = await this.prisma.user.findUnique({
      where: { id: calleeId },
      select: { notifyCalls: true },
    });
    return callee?.notifyCalls ?? false;
  }
}
