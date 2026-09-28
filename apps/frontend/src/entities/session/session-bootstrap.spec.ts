import { beforeEach, describe, expect, it, vi } from "vitest";

import { refreshSession } from "../../shared/api/auth-client";
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
    useSessionStore.setState({ status: "checking", accessToken: null, user: null });
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

  it("falls back to anonymous when there is no valid refresh cookie", async () => {
    vi.mocked(refreshSession).mockRejectedValue(new Error("401"));

    await ensureSession();

    expect(useSessionStore.getState().status).toBe("anonymous");
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
