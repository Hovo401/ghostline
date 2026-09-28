import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveTheme } from "./appearance-store";

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
