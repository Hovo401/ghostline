import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setNativeSystemBars } from "../native";

import { useAppearanceStore } from "./appearance-store";
import { useApplyAppearance } from "./use-apply-appearance";

vi.mock("../native", () => ({ setNativeSystemBars: vi.fn() }));

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

  it("hands the page background to the native system bars", () => {
    document.body.style.backgroundColor = "rgb(243, 241, 236)";
    renderHook(() => {
      useApplyAppearance();
    });
    expect(setNativeSystemBars).toHaveBeenLastCalledWith("#f3f1ec", true);
    document.body.style.backgroundColor = "";
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
