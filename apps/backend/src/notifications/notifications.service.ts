import type {
  Call,
  Message,
  NotificationSettings,
  NotificationTestKind,
  PushCallClosedPayload,
  PushSubscriptionBody,
  RegisterNativeDeviceBody,
} from "@ghostline/contracts";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

import { toAvatarUrl } from "../attachments/attachment.util";
import { callIncomingPush } from "../calls/call.util";
import { AppConfigService } from "../config/app-config.service";
import { NOTIFICATIONS_QUEUE, type NotificationJobData } from "../jobs/notifications.processor";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

const TEST_CALL_DELAY_MS = 5_000;

/**
 * Producer side of push (Web Push, docs/adr/0010; FCM, docs/adr/0017) —
 * decides *who* gets a notification and builds the payload;
 * `NotificationsProcessor` (worker) decides *how* to deliver it to each of
 * that user's subscribed browsers and installed apps.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly storage: StorageService,
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

  /**
   * Android app (docs/adr/0017). Upsert by `deviceId`: an FCM token rotation,
   * a re-login on the same phone, or another account signing in there all
   * just move the one row (to the new token/session/user). A token can't
   * belong to two installs, so a stale row still holding it is dropped.
   */
  async registerNativeDevice(
    userId: string,
    sessionId: string,
    body: RegisterNativeDeviceBody,
  ): Promise<void> {
    await this.prisma.nativePushDevice.deleteMany({
      where: { fcmToken: body.fcmToken, deviceId: { not: body.deviceId } },
    });
    const fields = {
      userId,
      sessionId,
      fcmToken: body.fcmToken,
      encKey: body.deviceKey,
      appVersionCode: body.appVersionCode,
    };
    await this.prisma.nativePushDevice.upsert({
      where: { deviceId: body.deviceId },
      create: { deviceId: body.deviceId, ...fields },
      update: fields,
    });
  }

  /** Scoped to `userId` so one account can't unregister another's phone. */
  async unregisterNativeDevice(userId: string, deviceId: string): Promise<void> {
    await this.prisma.nativePushDevice.deleteMany({ where: { userId, deviceId } });
  }

  /**
   * The reader's own phones drop that chat's notification (docs/adr/0017) —
   * read or replied to on the PC, nothing is left to show on the phone. Skips
   * the queue entirely for users without the app, since this runs on every
   * read and every send.
   */
  async notifyChatRead(userId: string, chatId: string, readSeq: bigint): Promise<void> {
    const devices = await this.prisma.nativePushDevice.count({ where: { userId } });
    if (devices === 0) return;
    await this.queue.add("push", {
      userId,
      payload: { kind: "chat:read", chatId, readSeq: readSeq.toString() },
      transports: ["native"],
    });
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

  /** A real push to every subscribed device of `userId` — proves the whole
   * server → push service → service worker chain, unlike a page-local `Notification`.
   * `call` ("Проверить звонок" in the Android app) rings a test call screen
   * after 5s — long enough to lock the phone first. */
  async sendTest(userId: string, kind: NotificationTestKind = "message"): Promise<void> {
    if (kind === "call") {
      await this.queue.add(
        "push",
        { userId, payload: { kind: "test-call", callerName: "Ghostline" }, transports: ["native"] },
        { delay: TEST_CALL_DELAY_MS },
      );
      return;
    }
    await this.queue.add("push", { userId, payload: { kind: "test" } });
  }

  /** Skipped entirely (no job enqueued) when the callee has calls muted (`notifyCalls: false`). */
  async notifyCallIncoming(
    call: Call,
    caller: { displayName: string; avatarKey: string | null },
  ): Promise<void> {
    if (!(await this.calleeWantsCallPush(call.calleeId))) return;
    await this.queue.add("push", {
      userId: call.calleeId,
      payload: callIncomingPush(
        call,
        caller.displayName,
        await toAvatarUrl(caller.avatarKey, this.storage),
        this.config.jwt.accessSecret,
      ),
    });
  }

  /** Tells the callee's devices to dismiss any `call:incoming` notification still showing. */
  async notifyCallClosed(call: Call, reason: PushCallClosedPayload["reason"]): Promise<void> {
    await this.queue.add("push", {
      userId: call.calleeId,
      payload: { kind: "call:closed", callId: call.id, reason },
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
