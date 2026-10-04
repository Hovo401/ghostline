import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: true,
  setStyle: vi.fn<(o: { style: string }) => Promise<void>>(),
}));

vi.mock("@capacitor/core", () => ({
  SystemBars: { setStyle: mocks.setStyle },
  SystemBarsStyle: { Dark: "DARK", Light: "LIGHT" },
}));
vi.mock("./is-native-app", () => ({ isNativeApp: () => mocks.native }));

import { setNativeBarStyle } from "./native-system-bars";

describe("setNativeBarStyle", () => {
  beforeEach(() => {
    mocks.native = true;
    mocks.setStyle.mockReset().mockResolvedValue(undefined);
  });

  it("uses dark icons on a light page and light icons on a dark one", async () => {
    await setNativeBarStyle("light");
    expect(mocks.setStyle).toHaveBeenLastCalledWith({ style: "LIGHT" });
    await setNativeBarStyle("dark");
    expect(mocks.setStyle).toHaveBeenLastCalledWith({ style: "DARK" });
  });

  it("does nothing outside the app", async () => {
    mocks.native = false;
    await setNativeBarStyle("light");
    expect(mocks.setStyle).not.toHaveBeenCalled();
  });

  it("swallows a plugin failure", async () => {
    mocks.setStyle.mockRejectedValue(new Error("UNIMPLEMENTED"));
    await expect(setNativeBarStyle("dark")).resolves.toBeUndefined();
  });
});
