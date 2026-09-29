import { beforeEach, describe, expect, it } from "vitest";

import { getAccessToken, useSessionStore } from "./session-store";

const USER = {
  id: "11111111-1111-1111-1111-111111111111",
  username: "tihiy_veter",
  displayName: "tihiy_veter",
  avatarKey: null,
  avatarUrl: null,
  bio: null,
  online: true,
  lastSeenAt: null,
};

describe("useSessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState({ status: "checking", accessToken: null, user: null });
  });

  it("starts in the checking state with no token/user", () => {
    expect(useSessionStore.getState().status).toBe("checking");
    expect(getAccessToken()).toBeNull();
  });

  it("setSession stores the token/user and flips to authenticated", () => {
    useSessionStore.getState().setSession("token-123", USER);

    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(useSessionStore.getState().user).toEqual(USER);
    expect(getAccessToken()).toBe("token-123");
  });

  it("clearSession drops the token/user and flips to anonymous", () => {
    useSessionStore.getState().setSession("token-123", USER);

    useSessionStore.getState().clearSession();

    expect(useSessionStore.getState().status).toBe("anonymous");
    expect(useSessionStore.getState().user).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it("updateUser patches the cached profile without touching the token/status", () => {
    useSessionStore.getState().setSession("token-123", USER);

    useSessionStore.getState().updateUser({ ...USER, displayName: "Новое имя" });

    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(useSessionStore.getState().user?.displayName).toBe("Новое имя");
    expect(getAccessToken()).toBe("token-123");
  });
});
