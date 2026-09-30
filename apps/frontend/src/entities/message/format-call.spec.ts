import { describe, expect, it } from "vitest";

import { formatCallLabel } from "./format-call";

describe("formatCallLabel", () => {
  it("labels an answered call by direction and duration", () => {
    const call = { status: "ended", video: true, durationMs: 323_000 } as const;
    expect(formatCallLabel(call, true)).toBe("Исходящий видеозвонок · 5:23");
    expect(formatCallLabel(call, false)).toBe("Входящий видеозвонок · 5:23");
  });

  it("labels an unanswered call by its status", () => {
    expect(formatCallLabel({ status: "cancelled", video: false, durationMs: null }, true)).toBe(
      "Отменённый аудиозвонок",
    );
  });
});
