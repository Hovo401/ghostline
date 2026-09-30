import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PushSubscriptionStatus } from "../../entities/notification";
import { apiFetch } from "../../shared/api/http-client";
import { useSessionStore } from "../../shared/api/session-store";

import { LogoutButton } from "./LogoutButton";

vi.mock("../../shared/api/http-client", () => ({
  apiFetch: vi.fn(),
}));

let pushStatus: PushSubscriptionStatus = "unsubscribed";
const unsubscribe = vi.fn<() => Promise<void>>();
vi.mock("../../entities/notification", () => ({
  usePushSubscription: () => ({ status: pushStatus, subscribe: vi.fn(), unsubscribe }),
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

function renderButton() {
  const rootRoute = createRootRoute();
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <LogoutButton />,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: () => <p>login page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([settingsRoute, loginRoute]),
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
  });
  const queryClient = new QueryClient();
  queryClient.setQueryData(["me"], ME);
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { queryClient };
}

describe("LogoutButton", () => {
  beforeEach(() => {
    pushStatus = "unsubscribed";
    unsubscribe.mockReset().mockResolvedValue();
    vi.mocked(apiFetch).mockReset().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    useSessionStore.setState({ status: "authenticated", accessToken: "token", user: ME });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("revokes the session, clears local state and goes to /login", async () => {
    const { queryClient } = renderButton();

    fireEvent.click(await screen.findByRole("button", { name: "Выйти из аккаунта" }));

    expect(await screen.findByText("login page")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/auth/logout", { method: "POST" });
    expect(useSessionStore.getState().status).toBe("anonymous");
    expect(queryClient.getQueryData(["me"])).toBeUndefined();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it("drops this device's push subscription before logging out", async () => {
    pushStatus = "subscribed";
    renderButton();

    fireEvent.click(await screen.findByRole("button", { name: "Выйти из аккаунта" }));

    await screen.findByText("login page");
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(apiFetch).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("still signs out locally when the server call fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    renderButton();

    fireEvent.click(await screen.findByRole("button", { name: "Выйти из аккаунта" }));

    await screen.findByText("login page");
    expect(useSessionStore.getState().status).toBe("anonymous");
  });

  it("does nothing when the confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderButton();

    fireEvent.click(await screen.findByRole("button", { name: "Выйти из аккаунта" }));

    await waitFor(() => {
      expect(useSessionStore.getState().status).toBe("authenticated");
    });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
