import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPermissionStatus, openSystemSettings, clearNotifications, hasGhostlinePlugin } =
  vi.hoisted(() => ({
    getPermissionStatus: vi.fn(),
    openSystemSettings: vi.fn(),
    clearNotifications: vi.fn(),
    hasGhostlinePlugin: vi.fn(),
  }));

vi.mock("./ghostline-plugin", () => ({
  Ghostline: { getPermissionStatus, openSystemSettings, clearNotifications },
  hasGhostlinePlugin,
}));

import {
  clearNativeNotifications,
  getNativePermissionStatus,
  openSystemSettings as openSettings,
} from "./native-permissions";

const STATUS = { notifications: true, unrestrictedBattery: false, oem: null };

describe("native permissions", () => {
  beforeEach(() => {
    hasGhostlinePlugin.mockReset().mockReturnValue(true);
    getPermissionStatus.mockReset().mockResolvedValue(STATUS);
    openSystemSettings.mockReset().mockResolvedValue(undefined);
    clearNotifications.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getNativePermissionStatus", () => {
    it("returns the phone's status", async () => {
      await expect(getNativePermissionStatus()).resolves.toEqual(STATUS);
    });

    it("is null in a browser", async () => {
      hasGhostlinePlugin.mockReturnValue(false);
      await expect(getNativePermissionStatus()).resolves.toBeNull();
      expect(getPermissionStatus).not.toHaveBeenCalled();
    });

    it("is null in an APK older than the checklist (UNIMPLEMENTED)", async () => {
      getPermissionStatus.mockRejectedValue({ code: "UNIMPLEMENTED" });
      await expect(getNativePermissionStatus()).resolves.toBeNull();
    });
  });

  describe("openSystemSettings", () => {
    it("opens the screen for a row", async () => {
      await expect(openSettings("battery")).resolves.toBe(true);
      expect(openSystemSettings).toHaveBeenCalledWith({ kind: "battery" });
    });

    it("reports a phone with no such screen", async () => {
      openSystemSettings.mockRejectedValue({ code: "UNAVAILABLE" });
      await expect(openSettings("autostart")).resolves.toBe(false);
    });
  });

  describe("clearNativeNotifications", () => {
    it("clears through the plugin", async () => {
      await clearNativeNotifications();
      expect(clearNotifications).toHaveBeenCalledOnce();
    });

    it("is a no-op in a browser", async () => {
      hasGhostlinePlugin.mockReturnValue(false);
      await clearNativeNotifications();
      expect(clearNotifications).not.toHaveBeenCalled();
    });

    it("swallows an old APK's UNIMPLEMENTED", async () => {
      clearNotifications.mockRejectedValue({ code: "UNIMPLEMENTED" });
      await expect(clearNativeNotifications()).resolves.toBeUndefined();
    });
  });
});
