import { createCipheriv, randomBytes } from "node:crypto";

import type {
  MessageType,
  NativeChatReadPush,
  NativePushEnvelope,
  NativePushPayload,
  NativeTestCallPush,
  PushPayload,
} from "@ghostline/contracts";

/**
 * Android-only pushes (docs/adr/0017) with no Web Push counterpart: Web Push
 * must show a notification for every push, and these show none
 * (`chat:read`) or only exist in the app (`test-call`).
 */
export type NativeOnlyPush = NativeChatReadPush | NativeTestCallPush;

/** Keeps the encrypted + base64 FCM data well under its 4 KB cap. */
export const NATIVE_BODY_MAX_CHARS = 500;

const NEW_MESSAGE = "Новое сообщение";

const NON_TEXT_PREVIEW: Record<Exclude<MessageType, "text">, string> = {
  image: "Фото",
  file: "Файл",
  voice: "Голосовое сообщение",
  video: "Видео",
  video_note: "Видеосообщение",
  call: "Звонок",
};

function messageBody(payload: Extract<PushPayload, { kind: "message" }>): string {
  if (!payload.preview) return NEW_MESSAGE;
  const { type, text } = payload.message;
  const body = type === "text" ? (text ?? NEW_MESSAGE) : NON_TEXT_PREVIEW[type];
  return body.length > NATIVE_BODY_MAX_CHARS ? `${body.slice(0, NATIVE_BODY_MAX_CHARS)}…` : body;
}

/**
 * Projects the one authored `PushPayload` onto the compact shape the Android
 * app decrypts: flat, text already preview-resolved and truncated, so the app
 * renders it without any per-type logic of its own. `actionTokenFor` signs
 * the reply/mark-read token for the recipient (`notifications/action-token.ts`).
 */
export function toNativePush(
  payload: PushPayload | NativeOnlyPush,
  actionTokenFor: (chatId: string) => string,
): NativePushPayload {
  switch (payload.kind) {
    case "message":
      return {
        kind: "message",
        chatId: payload.chatId,
        messageId: payload.message.id,
        seq: payload.message.seq.toString(),
        title: payload.chatTitle,
        body: messageBody(payload),
        sentAt: payload.message.createdAt,
        actionToken: actionTokenFor(payload.chatId),
      };
    case "call:incoming":
      return {
        kind: "call:incoming",
        callId: payload.call.id,
        chatId: payload.call.chatId,
        callerName: payload.callerName,
        callerAvatarUrl: payload.callerAvatarUrl,
        video: payload.call.video,
        declineToken: payload.declineToken,
        createdAt: payload.call.createdAt,
      };
    case "call:closed":
      return { kind: "call:closed", callId: payload.callId, reason: payload.reason };
    case "call:missed":
      return {
        kind: "call:missed",
        callId: payload.call.id,
        chatId: payload.call.chatId,
        callerName: payload.callerName,
        video: payload.call.video,
      };
    case "test":
      return { kind: "test" };
    case "chat:read":
    case "test-call":
      return payload;
  }
}

/**
 * AES-256-GCM under the device's own key, with its `deviceId` as additional
 * authenticated data (a payload can't be replayed to another install). The
 * GCM tag is appended to the ciphertext — the layout `javax.crypto`'s
 * `AES/GCM/NoPadding` expects on the Android side. `iv` is injectable only
 * for deterministic test fixtures.
 */
export function encryptNativePush(
  payload: NativePushPayload,
  deviceKeyBase64: string,
  deviceId: string,
  iv: Buffer = randomBytes(12),
): NativePushEnvelope {
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(deviceKeyBase64, "base64"), iv);
  cipher.setAAD(Buffer.from(deviceId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { v: "1", iv: iv.toString("base64"), ct: ciphertext.toString("base64") };
}
