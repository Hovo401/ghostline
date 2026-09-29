import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";
import { ME_QUERY_KEY } from "../../shared/api/query-keys";
import { useSessionStore } from "../../shared/api/session-store";

import { useUpdateMe } from "./use-update-me";

vi.mock("../../shared/api/http-client", () => ({
  apiFetch: vi.fn(),
}));

const UPDATED = {
  id: "11111111-1111-1111-1111-111111111111",
  username: "alex",
  displayName: "Новое имя",
  avatarKey: null,
  avatarUrl: null,
  bio: "Пишу код",
  online: true,
  lastSeenAt: null,
  showOnline: true,
  readReceipts: false,
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

describe("useUpdateMe", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    useSessionStore.setState({
      status: "authenticated",
      accessToken: "token",
      user: { ...UPDATED, displayName: "Старое имя" },
    });
  });

  it("PATCHes /me and patches the ['me'] cache + session-store on success", async () => {
    vi.mocked(apiFetch).mockResolvedValue(UPDATED);
    const { result, queryClient } = renderWithClient(() => useUpdateMe());

    result.current.mutate({ displayName: "Новое имя" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiFetch).toHaveBeenCalledWith("/me", {
      method: "PATCH",
      body: { displayName: "Новое имя" },
    });
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual(UPDATED);
    expect(useSessionStore.getState().user?.displayName).toBe("Новое имя");
  });
});
