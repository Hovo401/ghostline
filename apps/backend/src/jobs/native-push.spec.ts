import { createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NativePushPayloadSchema, type Message, type PushPayload } from "@ghostline/contracts";
import { describe, expect, it } from "vitest";

import { encryptNativePush, NATIVE_BODY_MAX_CHARS, toNativePush } from "./native-push";

const CHAT_ID = "7f0c2f4e-0000-4000-8000-0000000000c1";
const CALL_ID = "7f0c2f4e-0000-4000-8000-0000000000a1";
const DEVICE_ID = "7f0c2f4e-0000-4000-8000-0000000000d1";

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "7f0c2f4e-0000-4000-8000-0000000000e1",
    chatId: CHAT_ID,
    seq: 42n,
    senderId: "7f0c2f4e-0000-4000-8000-0000000000b1",
    clientMessageId: "7f0c2f4e-0000-4000-8000-0000000000f1",
    type: "text",
    text: "привет",
    attachmentId: null,
    attachment: null,
    durationMs: null,
    waveform: null,
    replyToId: null,
    call: null,
    reactions: [],
    status: "sent",
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-10-04T10:00:00.000Z",
    ...overrides,
  };
}

function messagePush(overrides: Partial<Message> = {}, preview = true): PushPayload {
  return {
    kind: "message",
    chatId: CHAT_ID,
    chatTitle: "Алиса",
    message: message(overrides),
    preview,
  };
}

const call = {
  id: CALL_ID,
  chatId: CHAT_ID,
  callerId: "7f0c2f4e-0000-4000-8000-0000000000b1",
  calleeId: "7f0c2f4e-0000-4000-8000-0000000000b2",
  video: true,
  status: "ringing" as const,
  createdAt: "2026-10-04T10:00:00.000Z",
  answeredAt: null,
  endedAt: null,
};

const token = (chatId: string) => `token-for-${chatId}`;

describe("toNativePush", () => {
  it("flattens a message, with the recipient's action token and a string seq", () => {
    const native = toNativePush(messagePush(), token);
    expect(native).toEqual({
      kind: "message",
      chatId: CHAT_ID,
      messageId: "7f0c2f4e-0000-4000-8000-0000000000e1",
      seq: "42",
      title: "Алиса",
      body: "привет",
      sentAt: "2026-10-04T10:00:00.000Z",
      actionToken: `token-for-${CHAT_ID}`,
    });
    expect(NativePushPayloadSchema.safeParse(native).success).toBe(true);
  });

  it("hides the text when previews are off", () => {
    expect(toNativePush(messagePush({}, false), token)).toMatchObject({ body: "Новое сообщение" });
  });

  it("labels non-text messages instead of sending their content", () => {
    expect(toNativePush(messagePush({ type: "voice", text: null }), token)).toMatchObject({
      body: "Голосовое сообщение",
    });
  });

  it("truncates long text", () => {
    const native = toNativePush(messagePush({ text: "а".repeat(4000) }), token);
    expect(native.kind === "message" && native.body.length).toBe(NATIVE_BODY_MAX_CHARS + 1);
  });

  it("flattens an incoming call", () => {
    const native = toNativePush(
      {
        kind: "call:incoming",
        call,
        callerName: "Алиса",
        callerAvatarUrl: null,
        declineToken: "decline",
      },
      token,
    );
    expect(native).toEqual({
      kind: "call:incoming",
      callId: CALL_ID,
      chatId: CHAT_ID,
      callerName: "Алиса",
      callerAvatarUrl: null,
      video: true,
      declineToken: "decline",
      createdAt: "2026-10-04T10:00:00.000Z",
    });
    expect(NativePushPayloadSchema.safeParse(native).success).toBe(true);
  });

  it("passes native-only pushes through unchanged", () => {
    const read = { kind: "chat:read" as const, chatId: CHAT_ID, readSeq: "42" };
    expect(toNativePush(read, token)).toBe(read);
  });
});

describe("encryptNativePush", () => {
  it("decrypts back to the payload with the device key and id", () => {
    const key = randomBytes(32);
    const payload = toNativePush(messagePush(), token);

    const envelope = encryptNativePush(payload, key.toString("base64"), DEVICE_ID);

    const raw = Buffer.from(envelope.ct, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAAD(Buffer.from(DEVICE_ID));
    decipher.setAuthTag(raw.subarray(raw.length - 16));
    const plain = Buffer.concat([
      decipher.update(raw.subarray(0, raw.length - 16)),
      decipher.final(),
    ]);

    expect(envelope.v).toBe("1");
    expect(JSON.parse(plain.toString("utf8"))).toEqual(payload);
  });

  it("fails authentication for another device id", () => {
    const key = randomBytes(32);
    const envelope = encryptNativePush({ kind: "test" }, key.toString("base64"), DEVICE_ID);

    const raw = Buffer.from(envelope.ct, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAAD(Buffer.from("some-other-device"));
    decipher.setAuthTag(raw.subarray(raw.length - 16));
    decipher.update(raw.subarray(0, raw.length - 16));

    expect(() => decipher.final()).toThrow();
  });
});

/**
 * `packages/contracts/fixtures/native-push.json` is also decrypted by the Android app's unit test
 * (`PushCryptoTest`) — if the backend's cipher layout ever changes, this fails before a phone does.
 */
describe("native push fixtures (shared with the Android app)", () => {
  interface FixtureCase {
    name: string;
    keyBase64: string;
    deviceId: string;
    payload: unknown;
    envelope: unknown;
  }
  const cases = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "../../packages/contracts/fixtures/native-push.json"),
      "utf8",
    ),
  ) as FixtureCase[];

  it.each(cases)(
    "$name: payload matches the schema and re-encrypts to the same envelope",
    (fixture) => {
      const payload = NativePushPayloadSchema.parse(fixture.payload);
      const iv = Buffer.from((fixture.envelope as { iv: string }).iv, "base64");
      expect(encryptNativePush(payload, fixture.keyBase64, fixture.deviceId, iv)).toEqual(
        fixture.envelope,
      );
    },
  );
});
