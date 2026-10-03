import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";
import { useSessionStore } from "../../shared/api/session-store";

import { Settings } from "./Settings";
import { isSettingsTab } from "./settings-tabs";

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

// Mirrors `routes/app/settings.tsx`'s id and `?tab=` validation — Settings
// reads its section through `getRouteApi("/app/settings")`.
function renderSettings(path = "/app/settings") {
  const rootRoute = createRootRoute();
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/app/settings",
    validateSearch: (search: Record<string, unknown>) =>
      isSettingsTab(search.tab) ? { tab: search.tab } : {},
    component: Settings,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([settingsRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function renderAndSettle(path?: string) {
  const view = renderSettings(path);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

describe("Settings", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue(ME);
    useSessionStore.setState({ status: "authenticated", accessToken: "token", user: ME });
  });

  afterEach(() => {
    cleanup();
    useSessionStore.setState({ status: "checking", accessToken: null, user: null });
  });

  it("shows the profile tab by default, loaded from /me", async () => {
    await renderAndSettle();

    expect(await screen.findByRole("heading", { name: "Профиль" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Алекс")).toBeInTheDocument();
  });

  it("switches to the appearance tab via the desktop section list", async () => {
    await renderAndSettle();
    await screen.findByRole("heading", { name: "Профиль" });

    // The phone segmented tab shares this label but has `role="tab"`, not
    // `"button"` — this targets the desktop section-list item specifically.
    fireEvent.click(screen.getByRole("button", { name: "Внешний вид" }));

    expect(await screen.findByRole("heading", { name: "Внешний вид" })).toBeInTheDocument();
  });

  // Regression: the chat list's notifications banner linked to settings and
  // always landed on «Профиль».
  it("opens the section named in ?tab=", async () => {
    await renderAndSettle("/app/settings?tab=notifications");

    expect(await screen.findByRole("heading", { name: "Уведомления" })).toBeInTheDocument();
  });
});
