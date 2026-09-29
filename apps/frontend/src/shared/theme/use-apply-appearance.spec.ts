import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useAppearanceStore } from "./appearance-store";
import { useApplyAppearance } from "./use-apply-appearance";

describe("useApplyAppearance", () => {
  beforeEach(() => {
    useAppearanceStore.setState({ theme: "paper", accent: "ion", font: "pixel" });
  });

  it("applies the stored preferences", () => {
    renderHook(() => {
      useApplyAppearance();
    });
    const root = document.documentElement;
    expect(root.getAttribute("data-theme")).toBe("paper");
    expect(root.getAttribute("data-accent")).toBe("ion");
    expect(root.getAttribute("data-font")).toBe("pixel");
  });

  it("applies the defaults on public pages regardless of preferences", () => {
    renderHook(() => {
      useApplyAppearance(false);
    });
    const root = document.documentElement;
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.getAttribute("data-accent")).toBe("signal");
    expect(root.getAttribute("data-font")).toBe("sans");
  });
});
