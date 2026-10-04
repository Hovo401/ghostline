import { beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  has: true,
  setSystemBars: vi.fn<(o: { color: string; darkIcons: boolean }) => Promise<void>>(),
}));

vi.mock("./ghostline-plugin", () => ({
  Ghostline: { setSystemBars: plugin.setSystemBars },
  hasGhostlinePlugin: () => plugin.has,
}));

import { setNativeSystemBars } from "./native-system-bars";

describe("setNativeSystemBars", () => {
  beforeEach(() => {
    plugin.has = true;
    plugin.setSystemBars.mockReset().mockResolvedValue(undefined);
  });

  it("passes the color and icon style to the plugin", async () => {
    await setNativeSystemBars("light-bg", true);
    expect(plugin.setSystemBars).toHaveBeenCalledWith({ color: "light-bg", darkIcons: true });
  });

  it("does nothing outside the app", async () => {
    plugin.has = false;
    await setNativeSystemBars("dark-bg", false);
    expect(plugin.setSystemBars).not.toHaveBeenCalled();
  });

  it("swallows UNIMPLEMENTED from an older APK", async () => {
    plugin.setSystemBars.mockRejectedValue(new Error("UNIMPLEMENTED"));
    await expect(setNativeSystemBars("dark-bg", false)).resolves.toBeUndefined();
  });
});
