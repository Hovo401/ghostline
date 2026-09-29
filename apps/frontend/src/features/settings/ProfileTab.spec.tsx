import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";
import { useSessionStore } from "../../shared/api/session-store";

import { ProfileTab } from "./ProfileTab";

vi.mock("../../shared/api/http-client", () => ({
  apiFetch: vi.fn(),
}));

const ME = {
  id: "11111111-1111-1111-1111-111111111111",
  username: "alex",
  displayName: "Алекс",
  avatarKey: null,
  avatarUrl: null,
  bio: "Пишу код",
  online: true,
  lastSeenAt: null,
  showOnline: true,
  readReceipts: true,
};

function renderProfileTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileTab />
    </QueryClientProvider>,
  );
}

describe("ProfileTab", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation((path) => {
      if (path === "/me") return Promise.resolve(ME);
      throw new Error(`unexpected apiFetch call: ${path}`);
    });
    useSessionStore.setState({ status: "authenticated", accessToken: "token", user: ME });
  });

  afterEach(() => {
    cleanup();
    useSessionStore.setState({ status: "checking", accessToken: null, user: null });
  });

  it("loads and shows the current profile, with Save disabled until something changes", async () => {
    renderProfileTab();

    expect(await screen.findByDisplayValue("Алекс")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Пишу код")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });

  it("enables Save once a field changes and PATCHes only the diff", async () => {
    vi.mocked(apiFetch).mockImplementation((path, options) => {
      if (path === "/me" && options?.method === undefined) {
        return Promise.resolve(ME);
      }
      if (path === "/me" && options?.method === "PATCH") {
        expect(options.body).toEqual({ displayName: "Новое имя" });
        return Promise.resolve({ ...ME, displayName: "Новое имя" });
      }
      throw new Error(`unexpected apiFetch call: ${path}`);
    });

    renderProfileTab();
    const nameField = await screen.findByDisplayValue("Алекс");

    fireEvent.change(nameField, { target: { value: "Новое имя" } });
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(screen.getByText("✓ Сохранено")).toBeInTheDocument();
    });
  });
});
