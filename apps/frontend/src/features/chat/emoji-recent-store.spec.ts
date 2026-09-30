import { beforeEach, describe, expect, it } from "vitest";

import { useEmojiRecentStore } from "./emoji-recent-store";

beforeEach(() => {
  useEmojiRecentStore.setState({ recent: [] });
});

describe("useEmojiRecentStore", () => {
  it("puts the newest pick first and never lists an emoji twice", () => {
    const { push } = useEmojiRecentStore.getState();

    push("👍");
    push("🔥");
    push("👍");

    expect(useEmojiRecentStore.getState().recent).toEqual(["👍", "🔥"]);
  });

  it("keeps only the 24 most recent", () => {
    const { push } = useEmojiRecentStore.getState();
    const emoji = Array.from({ length: 30 }, (_, index) => String.fromCodePoint(0x1f600 + index));

    emoji.forEach(push);

    const { recent } = useEmojiRecentStore.getState();
    expect(recent).toHaveLength(24);
    expect(recent[0]).toBe(emoji[29]);
  });
});
