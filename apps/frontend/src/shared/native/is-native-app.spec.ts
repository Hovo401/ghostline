import { afterEach, describe, expect, it, vi } from "vitest";

const { isNativePlatform } = vi.hoisted(() => ({ isNativePlatform: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform } }));

import { isNativeApp } from "./is-native-app";

describe("isNativeApp", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("mirrors Capacitor's platform check", () => {
    isNativePlatform.mockReturnValue(true);
    expect(isNativeApp()).toBe(true);
    isNativePlatform.mockReturnValue(false);
    expect(isNativeApp()).toBe(false);
  });
});
