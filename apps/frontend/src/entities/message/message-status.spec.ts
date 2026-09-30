import { describe, expect, it } from "vitest";

import {
  canDeleteMessage,
  canEditMessage,
  canReactToMessage,
  formatMessageMeta,
  hasMessageActions,
} from "./message-status";
import type { ChatMessage } from "./message.types";

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1",
    chatId: "chat-1",
    seq: 1n,
    senderId: "user-a",
    clientMessageId: "c1",
    type: "text",
    text: "hi",
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
    createdAt: "2026-01-01T12:34:00.000Z",
    ...overrides,
  };
}

describe("formatMessageMeta", () => {
  it("shows only the time for incoming messages, never a status", () => {
    const meta = formatMessageMeta(makeMessage({ status: "read" }), false, false);
    expect(meta.text).not.toMatch(/✓|прочитано/);
    expect(meta.accent).toBe(false);
  });

  it("uses a glyph for a non-last outgoing message", () => {
    expect(formatMessageMeta(makeMessage({ status: "sent" }), true, false).text).toMatch(/✓$/);
    expect(formatMessageMeta(makeMessage({ status: "delivered" }), true, false).text).toMatch(
      /✓✓$/,
    );
  });

  it("spells the status out as a word for the last outgoing message", () => {
    expect(formatMessageMeta(makeMessage({ status: "sent" }), true, true).text).toMatch(
      /отправлено$/,
    );
    expect(formatMessageMeta(makeMessage({ status: "read" }), true, true).text).toMatch(
      /прочитано$/,
    );
  });

  it("only accents the word 'прочитано' on the last outgoing message", () => {
    expect(formatMessageMeta(makeMessage({ status: "read" }), true, true).accent).toBe(true);
    expect(formatMessageMeta(makeMessage({ status: "read" }), true, false).accent).toBe(false);
  });

  it("shows a pending/failed affordance before the server acks", () => {
    expect(formatMessageMeta(makeMessage({ pending: true }), true, false).text).toMatch(/◷$/);
    expect(formatMessageMeta(makeMessage({ failed: true }), true, false).text).toMatch(
      /не отправлено$/,
    );
  });

  it("marks an edited message for both sides", () => {
    const edited = makeMessage({ editedAt: "2026-01-01T12:40:00.000Z" });
    expect(formatMessageMeta(edited, false, false).text).toMatch(/^изменено /);
    expect(formatMessageMeta(edited, true, true).text).toMatch(/^изменено .*отправлено$/);
  });
});

describe("canEditMessage / canDeleteMessage", () => {
  it("allows own sent text and captioned media", () => {
    expect(canEditMessage(makeMessage({}), "user-a")).toBe(true);
    expect(canEditMessage(makeMessage({ type: "image" }), "user-a")).toBe(true);
    expect(canDeleteMessage(makeMessage({}), "user-a")).toBe(true);
  });

  it("never allows someone else's message", () => {
    expect(canEditMessage(makeMessage({}), "user-b")).toBe(false);
    expect(canDeleteMessage(makeMessage({}), "user-b")).toBe(false);
  });

  it("allows deleting but not editing voice/video notes/calls", () => {
    for (const type of ["voice", "video_note", "call"] as const) {
      expect(canEditMessage(makeMessage({ type }), "user-a")).toBe(false);
      expect(canDeleteMessage(makeMessage({ type }), "user-a")).toBe(true);
    }
  });

  it("disallows both while a message is still pending or failed", () => {
    expect(canEditMessage(makeMessage({ pending: true }), "user-a")).toBe(false);
    expect(canDeleteMessage(makeMessage({ failed: true }), "user-a")).toBe(false);
  });

  it("gives a peer's text and voice message a menu (copy / reactions)", () => {
    expect(hasMessageActions(makeMessage({}), "user-b")).toBe(true);
    expect(hasMessageActions(makeMessage({ type: "voice", text: null }), "user-b")).toBe(true);
  });

  it("gives a peer's call row, and unsent or deleted rows, no menu at all", () => {
    expect(hasMessageActions(makeMessage({ type: "call", text: null }), "user-b")).toBe(false);
    expect(hasMessageActions(makeMessage({ pending: true, text: null }), "user-b")).toBe(false);
    expect(
      hasMessageActions(
        makeMessage({ deletedAt: "2026-01-01T00:00:00.000Z", text: null }),
        "user-b",
      ),
    ).toBe(false);
  });
});

describe("canReactToMessage", () => {
  it("allows any live, sent message — own or a peer's, text or media", () => {
    expect(canReactToMessage(makeMessage({}))).toBe(true);
    expect(canReactToMessage(makeMessage({ type: "voice", text: null }))).toBe(true);
  });

  it("refuses calls, unsent, failed and deleted messages", () => {
    expect(canReactToMessage(makeMessage({ type: "call" }))).toBe(false);
    expect(canReactToMessage(makeMessage({ pending: true }))).toBe(false);
    expect(canReactToMessage(makeMessage({ failed: true }))).toBe(false);
    expect(canReactToMessage(makeMessage({ deletedAt: "2026-01-01T00:00:00.000Z" }))).toBe(false);
  });
});
