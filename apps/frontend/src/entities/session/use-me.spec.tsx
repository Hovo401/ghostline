import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";
import { useSessionStore } from "../../shared/api/session-store";

import { useMe } from "./use-me";

vi.mock("../../shared/api/http-client", () => ({
  apiFetch: vi.fn(),
}));

const ME = {
  id: "11111111-1111-1111-1111-111111111111",
  username: "alex",
  displayName: "Алекс",
  avatarKey: null,
  avatarUrl: null,
  bio: null,
  online: true,
  lastSeenAt: null,
  showOnline: true,
  readReceipts: true,
};

function renderWithClient<T>(callback: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(callback, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe("useMe", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    useSessionStore.setState({ status: "checking", accessToken: null, user: null });
  });

  it("fetches /me once authenticated", async () => {
    vi.mocked(apiFetch).mockResolvedValue(ME);
    useSessionStore.setState({ status: "authenticated" });

    const { result } = renderWithClient(() => useMe());

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(apiFetch).toHaveBeenCalledWith("/me");
    expect(result.current.data).toEqual(ME);
  });

  it("does not fetch before the session resolves", () => {
    renderWithClient(() => useMe());

    expect(apiFetch).not.toHaveBeenCalled();
  });
});
