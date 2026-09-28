import { describe, expect, it } from "vitest";

import { sanitizeUsername, usernameHint } from "./username";

describe("sanitizeUsername", () => {
  it("lower-cases and strips anything outside a-z 0-9 _", () => {
    expect(sanitizeUsername("Tihiy Veter-42!")).toBe("tihiyveter42");
  });
});

describe("usernameHint", () => {
  it("prompts for allowed characters when empty", () => {
    expect(usernameHint("", { checking: false, available: undefined })).toEqual({
      text: "Латиница, цифры и _",
      tone: "mute",
    });
  });

  it("asks for the minimum length below 3 characters", () => {
    expect(usernameHint("ab", { checking: false, available: undefined })).toEqual({
      text: "Минимум 3 символа",
      tone: "mute",
    });
  });

  it("shows a neutral state while the availability check is in flight", () => {
    expect(usernameHint("tihiy", { checking: true, available: undefined })).toMatchObject({
      tone: "mute",
    });
  });

  it("confirms availability in accent tone", () => {
    expect(usernameHint("tihiy", { checking: false, available: true })).toEqual({
      text: "@tihiy свободно",
      tone: "accent",
    });
  });

  it("flags a taken username in danger tone", () => {
    expect(usernameHint("tihiy", { checking: false, available: false })).toEqual({
      text: "@tihiy уже занято",
      tone: "danger",
    });
  });
});
