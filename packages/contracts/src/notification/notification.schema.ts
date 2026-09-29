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
