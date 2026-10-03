import type { PushPayload } from "@ghostline/contracts";
import { describe, expect, it } from "vitest";

import {
  buildNotificationOptions,
  hasVisibleWindowClient,
  parsePushPayload,
} from "./sw-notifications";

const CALL = {
  id: "call-1",
  chatId: "chat-1",
  callerId: "caller-1",
  calleeId: "callee-1",
  video: true,
  status: "ringing" as const,
  createdAt: new Date().toISOString(),
  answeredAt: null,
  endedAt: null,
};

const MESSAGE = {
  id: "m1",
  chatId: "chat-1",
  seq: 1n,
  senderId: "caller-1",
  clientMessageId: "m1",
  type: "text" as const,
  text: "Привет!",
  attachmentId: null,
  attachment: null,
  durationMs: null,
  waveform: null,
  replyToId: null,
  call: null,
  reactions: [],
  status: "sent" as const,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date().toISOString(),
};

describe("buildNotificationOptions", () => {
  it("shows the message text when preview is on", () => {
    const payload: PushPayload = {
      kind: "message",
      chatId: "chat-1",
      chatTitle: "Олег",
      message: MESSAGE,
      preview: true,
    };
    const built = buildNotificationOptions(payload);
    expect(built.title).toBe("Олег");
    expect(built.options.body).toBe("Привет!");
    expect(built.options.tag).toBe("chat:chat-1");
    expect(built.options.renotify).toBe(true);
  });

  it("hides the message text when preview is off", () => {
    const payload: PushPayload = {
      kind: "message",
      chatId: "chat-1",
      chatTitle: "Олег",
      message: MESSAGE,
      preview: false,
    };
    expect(buildNotificationOptions(payload).options.body).toBe("Новое сообщение");
  });

  it("labels a non-text message by its type when preview is on", () => {
    const payload: PushPayload = {
      kind: "message",
      chatId: "chat-1",
      chatTitle: "Олег",
      message: { ...MESSAGE, type: "image", text: null },
      preview: true,
    };
    expect(buildNotificationOptions(payload).options.body).toBe("Фото");
  });

  it("builds a requireInteraction/actions notification for an incoming call", () => {
    const payload: PushPayload = {
      kind: "call:incoming",
      call: CALL,
      callerName: "Олег",
      callerAvatarUrl: null,
      declineToken: "signed-token",
    };
    const built = buildNotificationOptions(payload);
    expect(built.title).toBe("Олег");
    expect(built.options.body).toBe("Входящий видеозвонок");
    expect(built.options.tag).toBe("call:call-1");
    expect(built.options.requireInteraction).toBe(true);
    expect(built.options.actions).toEqual([
      { action: "answer", title: "Ответить" },
      { action: "decline", title: "Отклонить" },
    ]);
    expect(built.options.data).toMatchObject({ declineToken: "signed-token" });
  });

  it("builds a silent 'answered elsewhere' notification for call:closed", () => {
    const built = buildNotificationOptions({
      kind: "call:closed",
      callId: "call-1",
      reason: "answered-elsewhere",
    });
    expect(built.title).toBe("Ghostline");
    expect(built.options.body).toBe("Звонок принят на другом устройстве");
    expect(built.options.tag).toBe("call:call-1");
    expect(built.options.silent).toBe(true);
    expect(built.options.data).toEqual({ kind: "call:closed", callId: "call-1" });
  });

  it("builds a silent 'ended' notification for call:closed", () => {
    const built = buildNotificationOptions({
      kind: "call:closed",
      callId: "call-1",
      reason: "ended",
    });
    expect(built.options.body).toBe("Звонок завершён");
    expect(built.options.silent).toBe(true);
  });

  it("builds a missed-call notification", () => {
    const built = buildNotificationOptions({
      kind: "call:missed",
      call: { ...CALL, video: false },
      callerName: "Олег",
    });
    expect(built.options.body).toBe("Пропущенный звонок");
    expect(built.options.tag).toBe("call:call-1");
  });

  it("builds a visible notification for a test push", () => {
    const built = buildNotificationOptions({ kind: "test" });
    expect(built.title).toBe("Ghostline");
    expect(built.options.body).toContain("Тестовое");
  });
});

describe("parsePushPayload", () => {
  it("accepts a test push", () => {
    expect(parsePushPayload({ kind: "test" })).toEqual({ kind: "test" });
  });
});

describe("hasVisibleWindowClient", () => {
  it("is true when any client is visible", () => {
    expect(
      hasVisibleWindowClient([{ visibilityState: "hidden" }, { visibilityState: "visible" }]),
    ).toBe(true);
  });

  it("is false with no clients or none visible", () => {
    expect(hasVisibleWindowClient([])).toBe(false);
    expect(hasVisibleWindowClient([{ visibilityState: "hidden" }])).toBe(false);
  });
});
