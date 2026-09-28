import { describe, expect, it } from "vitest";

import { formatMessageMeta } from "./message-status";
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
    durationMs: null,
    waveform: null,
    replyToId: null,
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
});
