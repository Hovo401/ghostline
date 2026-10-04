import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";

const { checkPermissions, requestPermissions, getPushRegistration, hasGhostlinePlugin } =
  vi.hoisted(() => ({
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    getPushRegistration: vi.fn(),
    hasGhostlinePlugin: vi.fn(),
  }));

vi.mock("../../shared/api/http-client", () => ({ apiFetch: vi.fn() }));
vi.mock("../../shared/native", () => ({
  Ghostline: { checkPermissions, requestPermissions, getPushRegistration, addListener: vi.fn() },
  hasGhostlinePlugin,
  getInstalledBuild: () => Promise.resolve(7),
}));

import { resetPushSyncForTests, usePushSubscription } from "./use-push-subscription";

const REGISTRATION = {
  token: "fcm-token",
  deviceKey: `${"A".repeat(43)}=`,
  deviceId: "7f0c2f4e-0000-4000-8000-0000000000d1",
};

describe("usePushSubscription in the Android app", () => {
  beforeEach(() => {
    hasGhostlinePlugin.mockReturnValue(true);
    checkPermissions.mockReset().mockResolvedValue({ notifications: "granted" });
    requestPermissions.mockReset().mockResolvedValue({ notifications: "granted" });
    getPushRegistration.mockReset().mockResolvedValue(REGISTRATION);
    vi.mocked(apiFetch).mockReset().mockResolvedValue(undefined);
    resetPushSyncForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is 'subscribed' once the permission is granted and the device registered", async () => {
    const { result } = renderHook(() => usePushSubscription());

    await waitFor(() => {
      expect(result.current.status).toBe("subscribed");
    });
    expect(apiFetch).toHaveBeenCalledWith(
      "/notifications/native-devices",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("is 'denied' when Android's notification permission is denied", async () => {
    checkPermissions.mockResolvedValue({ notifications: "denied" });

    const { result } = renderHook(() => usePushSubscription());

    await waitFor(() => {
      expect(result.current.status).toBe("denied");
    });
  });

  it("is 'unsubscribed' while the permission has not been asked yet", async () => {
    checkPermissions.mockResolvedValue({ notifications: "prompt" });

    const { result } = renderHook(() => usePushSubscription());

    await waitFor(() => {
      expect(result.current.status).toBe("unsubscribed");
    });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("is 'unsubscribed' when registering with the server fails, so «Включить» retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getPushRegistration.mockRejectedValue(new Error("UNAVAILABLE"));

    const { result } = renderHook(() => usePushSubscription());

    await waitFor(() => {
      expect(result.current.status).toBe("unsubscribed");
    });
  });

  it("subscribe() asks for the Android permission, then registers", async () => {
    checkPermissions.mockResolvedValue({ notifications: "prompt" });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => {
      expect(result.current.status).toBe("unsubscribed");
    });

    await act(async () => {
      await result.current.subscribe();
    });

    expect(requestPermissions).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("subscribed");
  });

  it("subscribe() ends as 'denied' when the user refuses the system dialog", async () => {
    checkPermissions.mockResolvedValue({ notifications: "prompt" });
    requestPermissions.mockResolvedValue({ notifications: "denied" });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => {
      expect(result.current.status).toBe("unsubscribed");
    });

    await act(async () => {
      await result.current.subscribe();
    });

    expect(result.current.status).toBe("denied");
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
