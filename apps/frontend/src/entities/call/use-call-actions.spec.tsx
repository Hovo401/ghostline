import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "../../shared/api/http-client";
import type * as HttpClient from "../../shared/api/http-client";

import { useCallStore } from "./call-store";
import type { Call } from "./call.types";
import { useActiveCallQuery, useCallActions } from "./use-call-actions";

vi.mock("../../shared/api/http-client", async (importOriginal) => {
  const actual = await importOriginal<typeof HttpClient>();
  return { ...actual, apiFetch: vi.fn() };
});

function call(overrides: Partial<Call> = {}): Call {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    chatId: "22222222-2222-4222-8222-222222222222",
    callerId: "33333333-3333-4333-8333-333333333333",
    calleeId: "44444444-4444-4444-8444-444444444444",
    video: false,
    status: "ringing",
    createdAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    ...overrides,
  };
}

const RESET_STATE = {
  phase: "idle" as const,
  call: null,
  livekitUrl: null,
  token: null,
  minimized: false,
  localVideoIntent: true,
  draft: null,
  endReason: null,
  remoteJoined: false,
};

function renderWithClient<T>(callback: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = renderHook(callback, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { ...view, queryClient };
}

describe("useCallActions", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    useCallStore.setState(RESET_STATE);
  });

  it("start shows 'Calling…' immediately (draft), then fills in the call once POST /calls resolves", async () => {
    const join = { call: call(), livekitUrl: "wss://lk", token: "tok" };
    vi.mocked(apiFetch).mockResolvedValue(join);
    const { result } = renderWithClient(() => useCallActions());

    result.current.start({ chatId: "22222222-2222-4222-8222-222222222222", video: true });

    // Synchronous — no need to await anything for the draft to apply.
    expect(useCallStore.getState().phase).toBe("outgoing");
    expect(useCallStore.getState().draft).toEqual({
      chatId: "22222222-2222-4222-8222-222222222222",
      video: true,
    });
    expect(useCallStore.getState().call).toBeNull();

    await waitFor(() => {
      expect(useCallStore.getState().call?.id).toBe("11111111-1111-4111-8111-111111111111");
    });
    expect(apiFetch).toHaveBeenCalledWith("/calls", {
      method: "POST",
      body: { chatId: "22222222-2222-4222-8222-222222222222", video: true },
    });
    expect(useCallStore.getState().draft).toBeNull();
  });

  it.each([
    [409, "busy"],
    [403, "forbidden"],
    [429, "rate_limited"],
    [500, "unavailable"],
  ] as const)("start ending in a %i response ends locally as %s", async (status, reason) => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(status, "nope"));
    const { result } = renderWithClient(() => useCallActions());

    result.current.start({ chatId: "chat-1", video: false });

    await waitFor(() => {
      expect(useCallStore.getState().phase).toBe("ended");
    });
    expect(useCallStore.getState().endReason).toBe(reason);
  });

  it("a network failure (non-ApiError) also ends locally as unavailable", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderWithClient(() => useCallActions());

    result.current.start({ chatId: "chat-1", video: false });

    await waitFor(() => {
      expect(useCallStore.getState().phase).toBe("ended");
    });
    expect(useCallStore.getState().endReason).toBe("unavailable");
  });

  it("cancelling while start is still in flight fires cancel once the response arrives", async () => {
    let resolveStart!: (value: unknown) => void;
    vi.mocked(apiFetch).mockImplementation((path) => {
      if (path === "/calls") {
        return new Promise((resolve) => {
          resolveStart = resolve;
        });
      }
      return Promise.resolve(call({ status: "cancelled" }));
    });
    const { result } = renderWithClient(() => useCallActions());

    result.current.start({ chatId: "chat-1", video: false });
    expect(useCallStore.getState().phase).toBe("outgoing");

    // Wait for the mutationFn to actually start (and assign `resolveStart`)
    // without waiting for it to resolve — react-query defers invoking it by
    // a microtask, it doesn't happen synchronously inside `mutate()`.
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/calls", expect.anything());
    });

    result.current.cancel();
    // endLocally happens synchronously even with no call id yet.
    expect(useCallStore.getState().phase).toBe("ended");
    expect(useCallStore.getState().endReason).toBe("cancelled");
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/cancel"),
      expect.anything(),
    );

    resolveStart({ call: call(), livekitUrl: "wss://lk", token: "tok" });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/calls/11111111-1111-4111-8111-111111111111/cancel", {
        method: "POST",
      });
    });
    // The resurrected join must not overwrite the already-ended local state.
    expect(useCallStore.getState().phase).toBe("ended");
  });

  it("accept moves to connecting immediately, then stores the join credentials", async () => {
    const join = { call: call({ status: "active" }), livekitUrl: "wss://lk", token: "tok" };
    vi.mocked(apiFetch).mockResolvedValue(join);
    const { result } = renderWithClient(() => useCallActions());
    useCallStore.getState().receiveIncoming(call());

    result.current.accept("11111111-1111-4111-8111-111111111111");
    expect(useCallStore.getState().phase).toBe("connecting");

    await waitFor(() => {
      expect(useCallStore.getState().token).toBe("tok");
    });
    expect(apiFetch).toHaveBeenCalledWith("/calls/11111111-1111-4111-8111-111111111111/accept", {
      method: "POST",
    });
  });

  it("decline ends locally before the request resolves and doesn't revert on failure", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("network down"));
    const { result } = renderWithClient(() => useCallActions());
    useCallStore.getState().receiveIncoming(call());

    result.current.decline("11111111-1111-4111-8111-111111111111");
    expect(useCallStore.getState().phase).toBe("ended");
    expect(useCallStore.getState().endReason).toBe("declined");

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/calls/11111111-1111-4111-8111-111111111111/decline", {
        method: "POST",
      });
    });
    // Still ended — a failed decline request doesn't resurrect the call.
    expect(useCallStore.getState().phase).toBe("ended");
  });

  it("hangup ends locally before the request resolves", async () => {
    vi.mocked(apiFetch).mockResolvedValue(call({ status: "ended" }));
    const { result } = renderWithClient(() => useCallActions());
    useCallStore.getState().receiveIncoming(call());
    useCallStore.setState({ phase: "active" });

    result.current.hangup();
    expect(useCallStore.getState().phase).toBe("ended");
    expect(useCallStore.getState().endReason).toBe("ended");

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/calls/11111111-1111-4111-8111-111111111111/hangup", {
        method: "POST",
      });
    });
  });
});

describe("useActiveCallQuery", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    useCallStore.setState(RESET_STATE);
  });

  it("does nothing when there is no active call", async () => {
    vi.mocked(apiFetch).mockResolvedValue(null);
    const { result } = renderWithClient(() => useActiveCallQuery());

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(useCallStore.getState().call).toBeNull();
  });

  it("resumes an active call's join credentials while idle", async () => {
    const active = { call: call({ status: "active" }), livekitUrl: "wss://lk", token: "tok" };
    vi.mocked(apiFetch).mockResolvedValue(active);
    const { result } = renderWithClient(() => useActiveCallQuery());

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(useCallStore.getState().phase).toBe("connecting");
    expect(useCallStore.getState().token).toBe("tok");
  });

  it("never applies once this tab is already mid-call", async () => {
    useCallStore.getState().receiveIncoming(call({ id: "55555555-5555-4555-8555-555555555555" }));
    const active = {
      call: call({ id: "66666666-6666-4666-8666-666666666666" }),
      livekitUrl: "wss://lk",
      token: "tok",
    };
    vi.mocked(apiFetch).mockResolvedValue(active);
    const { result } = renderWithClient(() => useActiveCallQuery());

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(useCallStore.getState().call?.id).toBe("55555555-5555-4555-8555-555555555555");
  });

  it("does not re-apply an ended call when remounted (e.g. back from Settings)", async () => {
    const active = { call: call({ status: "active" }), livekitUrl: "wss://lk", token: "tok" };
    vi.mocked(apiFetch).mockResolvedValue(active);
    const { queryClient, unmount } = renderWithClient(() => useActiveCallQuery());

    await waitFor(() => {
      expect(useCallStore.getState().phase).toBe("connecting");
    });
    unmount();
    useCallStore.setState(RESET_STATE);

    renderHook(() => useActiveCallQuery(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    expect(useCallStore.getState().phase).toBe("idle");
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
