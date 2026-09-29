import type { UserPublicProfile } from "@ghostline/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ME_QUERY_KEY } from "../../shared/api/query-keys";
import { useSessionStore } from "../../shared/api/session-store";

import { useMeRealtime } from "./use-me-realtime";

const listeners = new Map<string, (payload: unknown) => void>();
const socket = {
  on: vi.fn((event: string, handler: (payload: unknown) => void) => {
    listeners.set(event, handler);
  }),
  off: vi.fn(),
};

vi.mock("../../shared/api/socket-client", () => ({
  getSocketClient: () => socket,
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

function renderWithClient() {
  const queryClient = new QueryClient();
  renderHook(
    () => {
      useMeRealtime();
    },
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    },
  );
  return queryClient;
}

describe("useMeRealtime", () => {
  beforeEach(() => {
    listeners.clear();
    useSessionStore.setState({
      status: "authenticated",
      accessToken: "token",
      user: { ...ME, displayName: "Старое имя" },
    });
  });

  it("patches the ['me'] cache and session-store for this user's own update", () => {
    const queryClient = renderWithClient();
    queryClient.setQueryData(ME_QUERY_KEY, { ...ME, displayName: "Старое имя" });

    const profile: UserPublicProfile = { ...ME, displayName: "Новое имя" };
    listeners.get("user:updated")?.(profile);

    expect(useSessionStore.getState().user?.displayName).toBe("Новое имя");
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toMatchObject({ displayName: "Новое имя" });
  });

  it("ignores updates for a different user", () => {
    const queryClient = renderWithClient();
    queryClient.setQueryData(ME_QUERY_KEY, { ...ME, displayName: "Старое имя" });

    listeners.get("user:updated")?.({ ...ME, id: "someone-else", displayName: "Чужое имя" });

    expect(useSessionStore.getState().user?.displayName).toBe("Старое имя");
  });
});
