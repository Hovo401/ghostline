import { describe, expect, it } from "vitest";

import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  it("formats sub-minute durations as 0:ss", () => {
    expect(formatDuration(7000)).toBe("0:07");
    expect(formatDuration(45_000)).toBe("0:45");
  });

  it("formats minute-plus durations as m:ss", () => {
    expect(formatDuration(63_000)).toBe("1:03");
    expect(formatDuration(600_000)).toBe("10:00");
  });

  it("clamps negative durations to 0:00", () => {
    expect(formatDuration(-500)).toBe("0:00");
  });

  it("rounds to the nearest second", () => {
    expect(formatDuration(1499)).toBe("0:01");
    expect(formatDuration(1500)).toBe("0:02");
  });
});
