import { describe, expect, it } from "vitest";

import { inkFor, isValidHex, luminance, normalizeHex, toneFromBackground } from "./color-utils";

describe("color-utils", () => {
  it("normalizes shorthand hex", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("#aabbcc")).toBe("#aabbcc");
  });

  it("validates hex strings", () => {
    expect(isValidHex("#B8F25B")).toBe(true);
    expect(isValidHex("#zzz")).toBe(false);
  });

  it("computes luminance for black and white", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBe(1);
  });

  it("picks tone from background brightness", () => {
    expect(toneFromBackground("#0b0d0c")).toBe("dark");
    expect(toneFromBackground("#f3f2ed")).toBe("light");
  });

  it("picks ink from accent brightness", () => {
    expect(inkFor("#ffffff")).toBe("#0b0d0c");
    expect(inkFor("#000000")).toBe("#ffffff");
  });
});
