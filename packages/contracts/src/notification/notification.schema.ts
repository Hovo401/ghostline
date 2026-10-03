import { z } from "zod";

import { CallSchema } from "../call/call.schema";
import { MessageSchema } from "../message/message.schema";

/**
 * Web Push (VAPID) subscriptions and per-user notification settings, plus the
 * push payload shape shared between the backend (author) and the frontend's
 * service worker (consumer) — see REQUIREMENTS.md §5.11 FR-NOTIF-04/05.
 */

export const PushSubscriptionKeysSchema = z.object({
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});
export type PushSubscriptionKeys = z.infer<typeof PushSubscriptionKeysSchema>;

/** `POST /notifications/subscriptions` body — the `PushSubscriptionJSON` a browser hands back. */
export const PushSubscriptionBodySchema = z.object({
  endpoint: z.string().url(),
  keys: PushSubscriptionKeysSchema,
});
export type PushSubscriptionBody = z.infer<typeof PushSubscriptionBodySchema>;

/** `GET`/`PATCH /notifications/settings`. */
export const NotificationSettingsSchema = z.object({
  messages: z.boolean(),
  calls: z.boolean(),
  preview: z.boolean(),
});
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

/** `PATCH /notifications/settings` body — every field optional, only the ones present change. */
export const NotificationSettingsPatchSchema = NotificationSettingsSchema.partial();
export type NotificationSettingsPatch = z.infer<typeof NotificationSettingsPatchSchema>;

const pushMessagePayloadSchema = z.object({
  kind: z.literal("message"),
  chatId: z.string().uuid(),
  chatTitle: z.string(),
  message: MessageSchema,
  /** false when `NotificationSettings.preview` is off — SW shows a generic body. */
  preview: z.boolean(),
});

const pushCallIncomingPayloadSchema = z.object({
  kind: z.literal("call:incoming"),
  call: CallSchema,
  callerName: z.string(),
  /** Presigned, short-lived — the Android call screen's avatar; `null` shows initials. */
  callerAvatarUrl: z.string().url().nullable(),
  /** HMAC-signed, lets the SW's "Decline" action reject without an access token. */
  declineToken: z.string(),
});

const pushCallClosedPayloadSchema = z.object({
  kind: z.literal("call:closed"),
  callId: z.string().uuid(),
  /** `answered-elsewhere` when a device other than the one showing the notification picked up; `ended` for every other terminal outcome (declined/cancelled/ended). */
  reason: z.enum(["answered-elsewhere", "ended"]),
});

const pushCallMissedPayloadSchema = z.object({
  kind: z.literal("call:missed"),
  call: CallSchema,
  callerName: z.string(),
});

/** `POST /notifications/test` — a real push round trip to every device of the requester. */
const pushTestPayloadSchema = z.object({
  kind: z.literal("test"),
});

export const PushPayloadSchema = z.discriminatedUnion("kind", [
  pushMessagePayloadSchema,
  pushCallIncomingPayloadSchema,
  pushCallClosedPayloadSchema,
  pushCallMissedPayloadSchema,
  pushTestPayloadSchema,
]);
export type PushPayload = z.infer<typeof PushPayloadSchema>;
export type PushMessagePayload = z.infer<typeof pushMessagePayloadSchema>;
export type PushCallIncomingPayload = z.infer<typeof pushCallIncomingPayloadSchema>;
export type PushCallClosedPayload = z.infer<typeof pushCallClosedPayloadSchema>;
export type PushCallMissedPayload = z.infer<typeof pushCallMissedPayloadSchema>;

/**
 * Android app (docs/adr/0017): `POST /notifications/native-devices`. The app
 * generates `deviceKey` itself (AES-256, base64) and the worker encrypts
 * every FCM payload for this device with it, so FCM only carries ciphertext.
 */
export const RegisterNativeDeviceBodySchema = z.object({
  /** Stable per install — re-registering (FCM token rotation) upserts by it. */
  deviceId: z.string().uuid(),
  fcmToken: z.string().min(1).max(4096),
  deviceKey: z.string().regex(/^[A-Za-z0-9+/]{43}=$/, "deviceKey must be 32 bytes, base64"),
  appVersionCode: z.number().int().positive(),
  platform: z.literal("android"),
});
export type RegisterNativeDeviceBody = z.infer<typeof RegisterNativeDeviceBodySchema>;

/** `POST /notifications/test?kind=` — `call` sends the Android app a test call screen 5s later. */
export const NotificationTestKindSchema = z.enum(["message", "call"]);
export type NotificationTestKind = z.infer<typeof NotificationTestKindSchema>;

/** `POST /messages/notification-reply?t=<actionToken>` — inline reply from the Android shade. */
export const NotificationReplyBodySchema = z.object({
  clientMessageId: z.string().uuid(),
  text: z.string().min(1).max(4000),
});
export type NotificationReplyBody = z.infer<typeof NotificationReplyBodySchema>;

/**
 * What the Android app decrypts out of an FCM data message — a flat, compact
 * projection of `PushPayload` (FCM data is capped at 4 KB) plus two
 * native-only kinds: `chat:read` (dismiss a chat's notification after it was
 * read on another device — Web Push can't send these, every push there must
 * show a notification) and `test-call` ("Проверить звонок"). Text is already
 * preview-resolved and truncated server-side, so the app never decides what
 * to hide. `seq` travels as a decimal string (it's a bigint).
 */
const nativeMessagePushSchema = z.object({
  kind: z.literal("message"),
  chatId: z.string().uuid(),
  messageId: z.string().uuid(),
  seq: z.string(),
  title: z.string(),
  body: z.string(),
  sentAt: z.string().datetime(),
  /** Authorizes reply/mark-read for this chat without an access token. */
  actionToken: z.string(),
});

const nativeCallIncomingPushSchema = z.object({
  kind: z.literal("call:incoming"),
  callId: z.string().uuid(),
  chatId: z.string().uuid(),
  callerName: z.string(),
  callerAvatarUrl: z.string().url().nullable(),
  video: z.boolean(),
  declineToken: z.string(),
  createdAt: z.string().datetime(),
});

const nativeCallClosedPushSchema = z.object({
  kind: z.literal("call:closed"),
  callId: z.string().uuid(),
  reason: z.enum(["answered-elsewhere", "ended"]),
});

const nativeCallMissedPushSchema = z.object({
  kind: z.literal("call:missed"),
  callId: z.string().uuid(),
  chatId: z.string().uuid(),
  callerName: z.string(),
  video: z.boolean(),
});

const nativeChatReadPushSchema = z.object({
  kind: z.literal("chat:read"),
  chatId: z.string().uuid(),
  readSeq: z.string(),
});

const nativeTestPushSchema = z.object({ kind: z.literal("test") });

const nativeTestCallPushSchema = z.object({
  kind: z.literal("test-call"),
  callerName: z.string(),
});

export const NativePushPayloadSchema = z.discriminatedUnion("kind", [
  nativeMessagePushSchema,
  nativeCallIncomingPushSchema,
  nativeCallClosedPushSchema,
  nativeCallMissedPushSchema,
  nativeChatReadPushSchema,
  nativeTestPushSchema,
  nativeTestCallPushSchema,
]);
export type NativePushPayload = z.infer<typeof NativePushPayloadSchema>;
export type NativeChatReadPush = z.infer<typeof nativeChatReadPushSchema>;
export type NativeTestCallPush = z.infer<typeof nativeTestCallPushSchema>;

/**
 * The FCM `data` map (all values strings, per FCM): AES-256-GCM over the
 * JSON of a `NativePushPayload`, keyed by the device's `deviceKey`, with the
 * device's `deviceId` as additional authenticated data. `ct` includes the
 * 16-byte GCM tag at its end (the layout `javax.crypto` expects).
 */
export const NativePushEnvelopeSchema = z.object({
  v: z.literal("1"),
  iv: z.string(),
  ct: z.string(),
});
export type NativePushEnvelope = z.infer<typeof NativePushEnvelopeSchema>;
