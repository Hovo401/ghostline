import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveMotionEnabled, resolveTheme, resolveTone } from "./appearance-store";

describe("resolveTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes through non-system themes unchanged", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
  });

  it("resolves 'system' from prefers-color-scheme", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("dark"),
    }));
    expect(resolveTheme("system")).toBe("dark");
  });
});

describe("resolveTone", () => {
  it("maps each built-in theme to its fixed tone", () => {
    expect(resolveTone("dark", "#000000")).toBe("dark");
    expect(resolveTone("light", "#000000")).toBe("light");
    expect(resolveTone("midnight", "#000000")).toBe("dark");
    expect(resolveTone("paper", "#000000")).toBe("light");
    expect(resolveTone("terminal", "#000000")).toBe("dark");
  });

  it("computes custom theme tone from the picked background", () => {
    expect(resolveTone("custom", "#0b0d0c")).toBe("dark");
    expect(resolveTone("custom", "#f3f2ed")).toBe("light");
  });
});

describe("resolveMotionEnabled", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is off when the user disabled decrypt", () => {
    expect(resolveMotionEnabled(false)).toBe(false);
  });

  it("is off when the OS asks for reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
    }));
    expect(resolveMotionEnabled(true)).toBe(false);
  });

  it("is on otherwise", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(resolveMotionEnabled(true)).toBe(true);
  });
});
