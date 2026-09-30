import { describe, expect, it } from "vitest";

import { ReactionEmojiSchema } from "./message.schema";

describe("ReactionEmojiSchema", () => {
  it.each([
    "👍",
    "❤️",
    "🔥",
    "👍🏽", // skin tone
    "👨‍👩‍👧", // ZWJ family
    "🇦🇲", // flag
    "1️⃣", // keycap
  ])("accepts %s", (emoji) => {
    expect(ReactionEmojiSchema.safeParse(emoji).success).toBe(true);
  });

  it.each(["", "a", "1", "ab", "👍👍", "👍 ", "hello 👍", "<script>"])("rejects %j", (value) => {
    expect(ReactionEmojiSchema.safeParse(value).success).toBe(false);
  });
});
