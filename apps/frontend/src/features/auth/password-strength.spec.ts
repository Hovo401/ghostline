import { describe, expect, it } from "vitest";

import { scorePasswordStrength } from "./password-strength";

describe("scorePasswordStrength", () => {
  it("is empty with no password yet", () => {
    expect(scorePasswordStrength("")).toEqual({ filled: 0, tone: "empty", label: "" });
  });

  it("flags under 8 characters as too short, regardless of variety", () => {
    expect(scorePasswordStrength("aB3!")).toMatchObject({ filled: 1, tone: "danger" });
  });

  it("scores 8+ chars of a single character class as medium", () => {
    expect(scorePasswordStrength("password")).toMatchObject({ filled: 2, tone: "warning" });
  });

  it("scores mixed-case-or-digits-but-short as strong", () => {
    expect(scorePasswordStrength("password1")).toMatchObject({ filled: 3, tone: "accent" });
  });

  it("scores long + varied passwords as very strong", () => {
    expect(scorePasswordStrength("Correct-Horse-1")).toMatchObject({
      filled: 4,
      tone: "accent",
      label: "Очень надёжный",
    });
  });
});
