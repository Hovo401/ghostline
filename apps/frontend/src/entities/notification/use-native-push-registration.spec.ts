import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";

const {
  getPushRegistration,
  addListener,
  hasGhostlinePlugin,
  getInstalledBuild,
  clearNativeNotifications,
} = vi.hoisted(() => ({
  getPushRegistration: vi.fn(),
  addListener: vi.fn(),
  hasGhostlinePlugin: vi.fn(),
  getInstalledBuild: vi.fn(),
  clearNativeNotifications: vi.fn(),
}));

vi.mock("../../shared/api/http-client", () => ({ apiFetch: vi.fn() }));
vi.mock("../../shared/native", () => ({
  Ghostline: { getPushRegistration, addListener },
  hasGhostlinePlugin,
  getInstalledBuild,
  clearNativeNotifications,
}));

import {
  resetNativeRegistrationForTests,
  resyncNativeDevice,
  syncNativeDevice,
  unregisterNativeDevice,
  useNativePushRegistration,
} from "./use-native-push-registration";

const DEVICE_ID = "7f0c2f4e-0000-4000-8000-0000000000d1";
const KEY = `${"A".repeat(43)}=`;

function registration(token = "fcm-token-1") {
  return { token, deviceKey: KEY, deviceId: DEVICE_ID };
}

describe("native push registration", () => {
  beforeEach(() => {
    resetNativeRegistrationForTests();
    vi.mocked(apiFetch).mockReset().mockResolvedValue(undefined);
    getPushRegistration.mockReset().mockResolvedValue(registration());
    getInstalledBuild.mockReset().mockResolvedValue(7);
    hasGhostlinePlugin.mockReset().mockReturnValue(true);
    clearNativeNotifications.mockReset().mockResolvedValue(undefined);
    addListener.mockReset().mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers the device with its key, token and installed build", async () => {
    await expect(syncNativeDevice()).resolves.toBe(true);

    expect(apiFetch).toHaveBeenCalledWith("/notifications/native-devices", {
      method: "POST",
      body: {
        deviceId: DEVICE_ID,
        fcmToken: "fcm-token-1",
        deviceKey: KEY,
        appVersionCode: 7,
        platform: "android",
      },
    });
  });

  it("registers once per page load, however many callers ask", async () => {
    await Promise.all([syncNativeDevice(), syncNativeDevice()]);
    await syncNativeDevice();

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("reports failure instead of throwing, and tries again next time", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getPushRegistration.mockRejectedValueOnce(new Error("UNAVAILABLE"));

    await expect(syncNativeDevice()).resolves.toBe(false);
    await expect(syncNativeDevice()).resolves.toBe(true);
  });

  it("re-registers with the new token on resync", async () => {
    await syncNativeDevice();
    getPushRegistration.mockResolvedValue(registration("fcm-token-2"));

    await resyncNativeDevice();

    const [path, options] = vi.mocked(apiFetch).mock.lastCall ?? [];
    expect(path).toBe("/notifications/native-devices");
    expect(options).toMatchObject({ body: { fcmToken: "fcm-token-2" } });
  });

  describe("unregisterNativeDevice", () => {
    it("deletes the registered device", async () => {
      await syncNativeDevice();

      await unregisterNativeDevice();

      expect(apiFetch).toHaveBeenLastCalledWith(`/notifications/native-devices/${DEVICE_ID}`, {
        method: "DELETE",
      });
    });

    it("clears the chat notifications along with the registration", async () => {
      await syncNativeDevice();

      await unregisterNativeDevice();

      expect(clearNativeNotifications).toHaveBeenCalledOnce();
    });

    it("still clears the notifications when the server call fails", async () => {
      await syncNativeDevice();
      vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline"));

      await expect(unregisterNativeDevice()).rejects.toThrow("offline");

      expect(clearNativeNotifications).toHaveBeenCalledOnce();
    });

    it("only clears notifications when this install never registered", async () => {
      await unregisterNativeDevice();

      expect(apiFetch).not.toHaveBeenCalled();
      expect(clearNativeNotifications).toHaveBeenCalledOnce();
    });

    it("does nothing outside the app", async () => {
      await syncNativeDevice();
      hasGhostlinePlugin.mockReturnValue(false);
      vi.mocked(apiFetch).mockClear();

      await unregisterNativeDevice();

      expect(apiFetch).not.toHaveBeenCalled();
      expect(clearNativeNotifications).not.toHaveBeenCalled();
    });

    it("lets the next login register again", async () => {
      await syncNativeDevice();
      await unregisterNativeDevice();
      vi.mocked(apiFetch).mockClear();

      await syncNativeDevice();

      expect(apiFetch).toHaveBeenCalledOnce();
    });
  });

  describe("useNativePushRegistration", () => {
    it("registers on mount and again when FCM rotates the token", async () => {
      renderHook(() => {
        useNativePushRegistration();
      });
      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledTimes(1);
      });

      const onTokenChanged = addListener.mock.calls[0]?.[1] as () => void;
      getPushRegistration.mockResolvedValue(registration("fcm-token-2"));
      onTokenChanged();

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledTimes(2);
      });
    });

    it("is inert without the plugin (a browser or an old APK)", () => {
      hasGhostlinePlugin.mockReturnValue(false);

      renderHook(() => {
        useNativePushRegistration();
      });

      expect(apiFetch).not.toHaveBeenCalled();
      expect(addListener).not.toHaveBeenCalled();
    });
  });
});
