import { describe, expect, it } from "vitest";

import { clampReadSeq, computeUnreadCount } from "./unread.util";

describe("computeUnreadCount", () => {
  it("is the gap between the chat's latest seq and the member's read pointer", () => {
    expect(computeUnreadCount(10n, 7n)).toBe(3);
  });

  it("is zero when fully read", () => {
    expect(computeUnreadCount(10n, 10n)).toBe(0);
  });

  it("never goes negative if the read pointer is somehow ahead", () => {
    expect(computeUnreadCount(5n, 10n)).toBe(0);
  });
});

describe("clampReadSeq", () => {
  it("passes through a value within range", () => {
    expect(clampReadSeq(5n, 2n, 10n)).toBe(5n);
  });

  it("never rewinds behind the current read pointer", () => {
    expect(clampReadSeq(1n, 5n, 10n)).toBe(5n);
  });

  it("never overshoots the chat's latest seq", () => {
    expect(clampReadSeq(999n, 5n, 10n)).toBe(10n);
  });
});
