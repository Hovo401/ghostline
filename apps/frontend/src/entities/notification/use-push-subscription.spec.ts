import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";

import { usePushSubscription } from "./use-push-subscription";

vi.mock("../../shared/api/http-client", () => ({ apiFetch: vi.fn() }));

interface StubOptions {
  permission?: NotificationPermission;
  getSubscription?: ReturnType<typeof vi.fn>;
  subscribe?: ReturnType<typeof vi.fn>;
}

function stubPushApis(options: StubOptions = {}) {
  const pushManager = {
    getSubscription: options.getSubscription ?? vi.fn().mockResolvedValue(null),
    subscribe: options.subscribe ?? vi.fn(),
  };
  const registration = { pushManager };
  vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve(registration) } });
  // `"PushManager" in window` is all the hook feature-detects — the value
  // itself is never called, so a bare marker object stands in for the real
  // constructor.
  vi.stubGlobal("PushManager", {});
  vi.stubGlobal("Notification", {
    permission: options.permission ?? "granted",
    requestPermission: vi.fn().mockResolvedValue(options.permission ?? "granted"),
  });
}

describe("usePushSubscription", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(apiFetch).mockReset();
  });

  it("is 'unsupported' when the Push API isn't available (the jsdom default)", async () => {
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => {
      expect(result.current.status).toBe("unsupported");
    });
  });

  it("reports 'unsubscribed' when supported but no subscription exists yet", async () => {
    stubPushApis({ getSubscription: vi.fn().mockResolvedValue(null) });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => {
      expect(result.current.status).toBe("unsubscribed");
    });
  });

  it("reports 'subscribed' when a subscription already exists", async () => {
    stubPushApis({ getSubscription: vi.fn().mockResolvedValue({}) });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => {
      expect(result.current.status).toBe("subscribed");
    });
  });

  it("reports 'denied' without prompting again once permission was already denied", async () => {
    stubPushApis({ permission: "denied" });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => {
      expect(result.current.status).toBe("denied");
    });
  });

  it("subscribe() requests permission, fetches the VAPID key and posts the subscription", async () => {
    const subscribeMock = vi.fn().mockResolvedValue({
      endpoint: "https://push.example/abc",
      toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } }),
    });
    stubPushApis({ getSubscription: vi.fn().mockResolvedValue(null), subscribe: subscribeMock });
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === "/notifications/vapid-key") return Promise.resolve({ publicKey: "aGVsbG8" });
      return Promise.resolve(undefined);
    });

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => {
      expect(result.current.status).toBe("unsubscribed");
    });

    await act(async () => {
      await result.current.subscribe();
    });

    expect(subscribeMock).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(apiFetch).toHaveBeenCalledWith("/notifications/subscriptions", {
      method: "POST",
      body: { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } },
    });
    expect(result.current.status).toBe("subscribed");
  });

  it("unsubscribe() removes the browser subscription and DELETEs it server-side", async () => {
    const unsubscribeMock = vi.fn().mockResolvedValue(true);
    stubPushApis({
      getSubscription: vi.fn().mockResolvedValue({
        endpoint: "https://push.example/abc",
        unsubscribe: unsubscribeMock,
      }),
    });

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => {
      expect(result.current.status).toBe("subscribed");
    });

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(unsubscribeMock).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith("/notifications/subscriptions", {
      method: "DELETE",
      body: { endpoint: "https://push.example/abc" },
    });
    expect(result.current.status).toBe("unsubscribed");
  });
});
