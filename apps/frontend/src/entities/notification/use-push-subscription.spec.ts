import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";

import { resetPushSyncForTests, usePushSubscription } from "./use-push-subscription";

vi.mock("../../shared/api/http-client", () => ({ apiFetch: vi.fn() }));

/** base64url "aGVsbG8" — what the mocked `GET /notifications/vapid-key` returns. */
const VAPID_KEY = "aGVsbG8";
const VAPID_KEY_BYTES = new TextEncoder().encode("hello");

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

function fakeSubscription(endpoint: string, key: Uint8Array = VAPID_KEY_BYTES) {
  return {
    endpoint,
    options: { applicationServerKey: key.buffer },
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
  };
}

function mockServer() {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path === "/notifications/vapid-key") return Promise.resolve({ publicKey: VAPID_KEY });
    return Promise.resolve(undefined);
  });
}

describe("usePushSubscription", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(apiFetch).mockReset();
    resetPushSyncForTests();
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
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("re-registers an existing browser subscription with the server on load", async () => {
    // Regression: the server row can be gone (deleted after a 403/404/410,
    // or taken over by another account on this browser) while the browser
    // still holds the subscription — this used to report 'subscribed' and
    // never deliver anything.
    stubPushApis({
      getSubscription: vi.fn().mockResolvedValue(fakeSubscription("https://push.example/abc")),
    });
    mockServer();

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => {
      expect(result.current.status).toBe("subscribed");
    });

    expect(apiFetch).toHaveBeenCalledWith("/notifications/subscriptions", {
      method: "POST",
      body: { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } },
    });
  });

  it("replaces a subscription made under an older VAPID key", async () => {
    const stale = fakeSubscription("https://push.example/old", new TextEncoder().encode("other"));
    const subscribeMock = vi.fn().mockResolvedValue(fakeSubscription("https://push.example/new"));
    stubPushApis({ getSubscription: vi.fn().mockResolvedValue(stale), subscribe: subscribeMock });
    mockServer();

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => {
      expect(result.current.status).toBe("subscribed");
    });

    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith("/notifications/subscriptions", {
      method: "POST",
      body: { endpoint: "https://push.example/new", keys: { p256dh: "p", auth: "a" } },
    });
  });

  it("falls back to 'unsubscribed' instead of hanging when the sync fails", async () => {
    stubPushApis({
      getSubscription: vi.fn().mockResolvedValue(fakeSubscription("https://push.example/abc")),
    });
    vi.mocked(apiFetch).mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => {
      expect(result.current.status).toBe("unsubscribed");
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
    const subscribeMock = vi.fn().mockResolvedValue(fakeSubscription("https://push.example/abc"));
    stubPushApis({ getSubscription: vi.fn().mockResolvedValue(null), subscribe: subscribeMock });
    mockServer();

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
    const subscription = fakeSubscription("https://push.example/abc");
    stubPushApis({ getSubscription: vi.fn().mockResolvedValue(subscription) });
    mockServer();

    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => {
      expect(result.current.status).toBe("subscribed");
    });

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith("/notifications/subscriptions", {
      method: "DELETE",
      body: { endpoint: "https://push.example/abc" },
    });
    expect(result.current.status).toBe("unsubscribed");
  });
});
