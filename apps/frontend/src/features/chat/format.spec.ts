import { describe, expect, it } from "vitest";

import type { ChatListItem } from "../../entities/chat";
import type { Message } from "../../entities/message";

import { chatDisplayName, chatPreview } from "./format";

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: "m1",
    chatId: "chat-1",
    seq: 1n,
    senderId: "peer-1",
    clientMessageId: "c1",
    type: "text",
    text: "Привет",
    attachmentId: null,
    attachment: null,
    durationMs: null,
    waveform: null,
    replyToId: null,
    status: "sent",
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeChat(overrides: Partial<ChatListItem>): ChatListItem {
  return {
    id: "chat-1",
    type: "DIRECT",
    peer: {
      id: "peer-1",
      username: "oleg",
      displayName: "Олег",
      avatarKey: null,
      online: true,
    },
    lastMessage: null,
    unreadCount: 0,
    muted: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("chatDisplayName", () => {
  it("uses the peer's display name for direct chats", () => {
    expect(chatDisplayName(makeChat({}))).toBe("Олег");
  });

  it("falls back to Избранное for Saved Messages", () => {
    expect(chatDisplayName(makeChat({ peer: null, type: "SAVED" }))).toBe("Избранное");
  });
});

describe("chatPreview", () => {
  it("prefixes 'Вы:' when the last message is mine", () => {
    const chat = makeChat({ lastMessage: makeMessage({ senderId: "me" }) });
    expect(chatPreview(chat, "me")).toBe("Вы: Привет");
  });

  it("shows the text as-is when the peer sent it", () => {
    const chat = makeChat({ lastMessage: makeMessage({ senderId: "peer-1" }) });
    expect(chatPreview(chat, "me")).toBe("Привет");
  });

  it("shows a placeholder for a deleted message", () => {
    const chat = makeChat({
      lastMessage: makeMessage({ senderId: "peer-1", deletedAt: "2026-01-01T00:00:01.000Z" }),
    });
    expect(chatPreview(chat, "me")).toBe("Сообщение удалено");
  });

  it("shows a plain label for a photo", () => {
    const chat = makeChat({
      lastMessage: makeMessage({ senderId: "peer-1", type: "image", text: null }),
    });
    expect(chatPreview(chat, "me")).toBe("Фото");
  });

  it("shows the file name for a file attachment", () => {
    const chat = makeChat({
      lastMessage: makeMessage({
        senderId: "peer-1",
        type: "file",
        text: null,
        attachment: {
          id: "a1",
          key: "k",
          mime: "application/pdf",
          size: 100,
          width: null,
          height: null,
          name: "report.pdf",
          url: "https://s3.example/report.pdf",
        },
      }),
    });
    expect(chatPreview(chat, "me")).toBe("Файл · report.pdf");
  });

  it("shows the duration for a voice message", () => {
    const chat = makeChat({
      lastMessage: makeMessage({
        senderId: "peer-1",
        type: "voice",
        text: null,
        durationMs: 12_000,
      }),
    });
    expect(chatPreview(chat, "me")).toBe("Голосовое · 0:12");
  });

  it("shows the duration for a video note", () => {
    const chat = makeChat({
      lastMessage: makeMessage({
        senderId: "peer-1",
        type: "video",
        text: null,
        durationMs: 5_000,
      }),
    });
    expect(chatPreview(chat, "me")).toBe("Видео · 0:05");
  });
});
