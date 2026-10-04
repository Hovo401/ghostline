import { beforeEach, describe, expect, it, vi } from "vitest";

import { refreshSession } from "../../shared/api/auth-client";
import { ApiError } from "../../shared/api/http-client";
import { useSessionStore } from "../../shared/api/session-store";

import { ensureSession } from "./session-bootstrap";

vi.mock("../../shared/api/auth-client", () => ({
  refreshSession: vi.fn(),
}));

const USER = {
  id: "1",
  username: "tihiy_veter",
  displayName: "tihiy_veter",
  avatarKey: null,
  avatarUrl: null,
  bio: null,
  online: true,
  lastSeenAt: null,
};

describe("ensureSession", () => {
  beforeEach(() => {
    vi.mocked(refreshSession).mockReset();
    useSessionStore.setState({
      status: "checking",
      accessToken: null,
      user: null,
      reconnecting: false,
    });
  });

  it("authenticates the store when the refresh cookie is valid", async () => {
    vi.mocked(refreshSession).mockResolvedValue({ accessToken: "tok", user: USER });

    await ensureSession();

    expect(useSessionStore.getState()).toMatchObject({
      status: "authenticated",
      accessToken: "tok",
      user: USER,
    });
  });

  it("falls back to anonymous when the server rejects the refresh cookie", async () => {
    vi.mocked(refreshSession).mockRejectedValue(new ApiError(401, "invalid"));

    await ensureSession();

    expect(useSessionStore.getState().status).toBe("anonymous");
    expect(useSessionStore.getState().reconnecting).toBe(false);
  });

  it("never flags reconnecting when the first attempt succeeds", async () => {
    vi.mocked(refreshSession).mockResolvedValue({ accessToken: "tok", user: USER });
    const seen: boolean[] = [];
    const unsubscribe = useSessionStore.subscribe((s) => seen.push(s.reconnecting));

    await ensureSession();
    unsubscribe();

    expect(seen).not.toContain(true);
    expect(useSessionStore.getState().reconnecting).toBe(false);
  });

  it("keeps the session and retries when the network is down or the server fails", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(refreshSession)
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockRejectedValueOnce(new ApiError(503, "unavailable"))
        .mockResolvedValue({ accessToken: "tok", user: USER });

      const done = ensureSession();
      await vi.advanceTimersByTimeAsync(0);
      expect(useSessionStore.getState().status).toBe("checking");
      expect(useSessionStore.getState().reconnecting).toBe(true);
      await vi.advanceTimersByTimeAsync(10_000);
      await done;
      expect(useSessionStore.getState().reconnecting).toBe(false);

      expect(refreshSession).toHaveBeenCalledTimes(3);
      expect(useSessionStore.getState()).toMatchObject({
        status: "authenticated",
        accessToken: "tok",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries at once when the browser comes back online", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(refreshSession)
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValue({ accessToken: "tok", user: USER });

      const done = ensureSession();
      await vi.advanceTimersByTimeAsync(0);
      window.dispatchEvent(new Event("online"));
      await done;

      expect(useSessionStore.getState().status).toBe("authenticated");
    } finally {
      vi.useRealTimers();
    }
  });

  it("only calls refresh once for concurrent callers", async () => {
    vi.mocked(refreshSession).mockResolvedValue({ accessToken: "tok", user: USER });

    await Promise.all([ensureSession(), ensureSession()]);

    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("is a no-op once the session is already resolved", async () => {
    useSessionStore.getState().setSession("tok", USER);

    await ensureSession();

    expect(refreshSession).not.toHaveBeenCalled();
  });
});
