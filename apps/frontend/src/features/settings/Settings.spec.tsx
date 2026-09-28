import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";
import { useSessionStore } from "../../shared/api/session-store";

import { Settings } from "./Settings";

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

// Same idea as features/chat/Chat.spec.tsx — a single-root-route router is
// enough for a component that only uses `Link`, no nested route matching.
function renderSettings() {
  const rootRoute = createRootRoute({ component: Settings });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function renderAndSettle() {
  const view = renderSettings();
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

    expect(screen.getByRole("heading", { name: "Внешний вид" })).toBeInTheDocument();
  });
});
