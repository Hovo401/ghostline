import { describe, expect, it } from "vitest";

import { applyReaction, myReaction } from "./message-reactions";
import type { ChatMessage } from "./message.types";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";

function message(reactions: ChatMessage["reactions"] = []): ChatMessage {
  return { id: "m1", reactions } as ChatMessage;
}

describe("myReaction", () => {
  it("finds the emoji the user reacted with", () => {
    const m = message([{ emoji: "🔥", count: 2, userIds: [ALICE, BOB] }]);
    expect(myReaction(m, BOB)).toBe("🔥");
  });

  it("is null when the user hasn't reacted or isn't known", () => {
    const m = message([{ emoji: "🔥", count: 1, userIds: [ALICE] }]);
    expect(myReaction(m, BOB)).toBeNull();
    expect(myReaction(m, null)).toBeNull();
  });
});

describe("applyReaction", () => {
  it("adds a new group", () => {
    expect(applyReaction(message(), ALICE, "👍").reactions).toEqual([
      { emoji: "👍", count: 1, userIds: [ALICE] },
    ]);
  });

  it("joins an existing group in place", () => {
    const m = message([
      { emoji: "👍", count: 1, userIds: [ALICE] },
      { emoji: "🔥", count: 1, userIds: ["x"] },
    ]);
    expect(applyReaction(m, BOB, "👍").reactions).toEqual([
      { emoji: "👍", count: 2, userIds: [ALICE, BOB] },
      { emoji: "🔥", count: 1, userIds: ["x"] },
    ]);
  });

  it("replaces the user's previous reaction and drops a group it empties", () => {
    const m = message([{ emoji: "👍", count: 1, userIds: [ALICE] }]);
    expect(applyReaction(m, ALICE, "❤️").reactions).toEqual([
      { emoji: "❤️", count: 1, userIds: [ALICE] },
    ]);
  });

  it("keeps the other users of a group when the user switches away", () => {
    const m = message([{ emoji: "👍", count: 2, userIds: [ALICE, BOB] }]);
    expect(applyReaction(m, ALICE, "❤️").reactions).toEqual([
      { emoji: "👍", count: 1, userIds: [BOB] },
      { emoji: "❤️", count: 1, userIds: [ALICE] },
    ]);
  });

  it("removes the reaction when cleared", () => {
    const m = message([{ emoji: "👍", count: 1, userIds: [ALICE] }]);
    expect(applyReaction(m, ALICE, null).reactions).toEqual([]);
  });

  it("does not mutate the input", () => {
    const m = message([{ emoji: "👍", count: 1, userIds: [ALICE] }]);
    applyReaction(m, ALICE, "🔥");
    expect(m.reactions).toEqual([{ emoji: "👍", count: 1, userIds: [ALICE] }]);
  });
});
