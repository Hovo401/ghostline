import { describe, expect, it } from "vitest";

import { groupMessages, lastOutgoingIndex } from "./message-grouping";
import type { ChatMessage } from "./message.types";

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: overrides.id ?? "m1",
    chatId: "chat-1",
    seq: overrides.seq ?? 1n,
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
    status: "sent",
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupMessages", () => {
  it("marks the first message as a group start", () => {
    const messages = [makeMessage({ id: "1" })];
    const [group] = groupMessages(messages, "user-a");
    expect(group?.groupStart).toBe(true);
    expect(group?.isOwn).toBe(true);
  });

  it("only starts a new group when the sender changes", () => {
    const messages = [
      makeMessage({ id: "1", senderId: "a" }),
      makeMessage({ id: "2", senderId: "a" }),
      makeMessage({ id: "3", senderId: "b" }),
      makeMessage({ id: "4", senderId: "b" }),
    ];
    const groups = groupMessages(messages, "a");
    expect(groups.map((g) => g.groupStart)).toEqual([true, false, true, false]);
    expect(groups.map((g) => g.isOwn)).toEqual([true, true, false, false]);
  });

  it("treats every message as not-own when there's no current user", () => {
    const messages = [makeMessage({ id: "1", senderId: "a" })];
    const groups = groupMessages(messages, null);
    expect(groups[0]?.isOwn).toBe(false);
  });
});

describe("lastOutgoingIndex", () => {
  it("finds the last message sent by the current user", () => {
    const messages = [
      makeMessage({ id: "1", senderId: "a" }),
      makeMessage({ id: "2", senderId: "b" }),
      makeMessage({ id: "3", senderId: "a" }),
      makeMessage({ id: "4", senderId: "b" }),
    ];
    expect(lastOutgoingIndex(messages, "a")).toBe(2);
  });

  it("returns -1 when there is no current user or no outgoing message", () => {
    const messages = [makeMessage({ id: "1", senderId: "b" })];
    expect(lastOutgoingIndex(messages, null)).toBe(-1);
    expect(lastOutgoingIndex(messages, "a")).toBe(-1);
  });

  it("skips call rows — they get no status word", () => {
    const messages = [
      makeMessage({ id: "1", senderId: "a" }),
      makeMessage({ id: "2", senderId: "a", type: "call" }),
    ];
    expect(lastOutgoingIndex(messages, "a")).toBe(0);
  });
});
