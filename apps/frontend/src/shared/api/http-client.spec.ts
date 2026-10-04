import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "./http-client";
import { setSessionRefresher, useSessionStore } from "./session-store";

function firstCall<T>(calls: T[]): T {
  const call = calls[0];
  if (!call) throw new Error("expected fetch to have been called");
  return call;
}

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useSessionStore.setState({ status: "checking", accessToken: null, user: null });
  });

  it("builds the /api/v1 URL, encodes search params, and includes credentials", async () => {
    const fetchMock = vi.fn((_input: URL, _init: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch("/users/availability", {
      searchParams: { username: "tihiy veter" },
    });

    expect(result).toEqual({ ok: true });
    const [url, init] = firstCall(fetchMock.mock.calls);
    expect(url.pathname).toBe("/api/v1/users/availability");
    expect(url.searchParams.get("username")).toBe("tihiy veter");
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("attaches the in-memory access token as a bearer header", async () => {
    useSessionStore.getState().setSession("token-abc", {
      id: "1",
      username: "u",
      displayName: "u",
      avatarKey: null,
      avatarUrl: null,
      bio: null,
      online: false,
      lastSeenAt: null,
    });
    const fetchMock = vi.fn((_input: URL, _init: RequestInit) =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/me");

    const [, init] = firstCall(fetchMock.mock.calls);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-abc");
  });

  it("throws ApiError with the response status on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("nope", { status: 403, statusText: "Forbidden" }))),
    );

    await expect(apiFetch("/me")).rejects.toBeInstanceOf(ApiError);
  });

  describe("401 refresh", () => {
    const USER = {
      id: "1",
      username: "u",
      displayName: "u",
      avatarKey: null,
      avatarUrl: null,
      bio: null,
      online: false,
      lastSeenAt: null,
    };

    afterEach(() => {
      setSessionRefresher(() => Promise.reject(new Error("no refresher")));
    });

    function stubUnauthorized() {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(new Response("no", { status: 401 }))),
      );
      useSessionStore.getState().setSession("old", USER);
    }

    it("keeps the session when the refresh fails because of the network", async () => {
      stubUnauthorized();
      setSessionRefresher(() => Promise.reject(new TypeError("Failed to fetch")));

      await expect(apiFetch("/me")).rejects.toBeInstanceOf(ApiError);

      expect(useSessionStore.getState().status).toBe("authenticated");
    });

    it("clears the session when the server rejects the refresh cookie", async () => {
      stubUnauthorized();
      setSessionRefresher(() => Promise.reject(new ApiError(401, "reuse detected")));

      await expect(apiFetch("/me")).rejects.toBeInstanceOf(ApiError);

      expect(useSessionStore.getState().status).toBe("anonymous");
    });
  });
});
