import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionStore } from "../../shared/api/session-store";

import { Chat } from "./Chat";

// `Chat` mounts the shared socket for its lifetime (useGhostlineSocket) —
// stub it so the test doesn't open a real Socket.IO connection, same idea
// as Auth.spec.tsx's minimal router for a component that needs real infra
// around it.
vi.mock("../../shared/api/socket-client", () => {
  const socket = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
  return {
    getSocketClient: () => socket,
    useGhostlineSocket: () => socket,
  };
});

function renderChat() {
  const rootRoute = createRootRoute({ component: Chat });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/app"] }),
  });
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function renderAndSettle() {
  const view = renderChat();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

describe("Chat", () => {
  beforeEach(() => {
    useSessionStore.setState({
      status: "authenticated",
      accessToken: "token",
      user: {
        id: "me",
        username: "me",
        displayName: "Я",
        avatarKey: null,
        bio: null,
        online: true,
        lastSeenAt: null,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useSessionStore.setState({ status: "checking", accessToken: null, user: null });
  });

  it("renders the chat list and an empty-state thread when nothing is selected", async () => {
    await renderAndSettle();

    expect(screen.getByRole("heading", { name: "Чаты" })).toBeInTheDocument();
    expect(screen.getByText("// выберите чат")).toBeInTheDocument();
  });

  it("opens the new-chat modal from the 'Новый' button", async () => {
    await renderAndSettle();

    screen.getByRole("button", { name: "Новый" }).click();

    expect(await screen.findByText("Новый чат")).toBeInTheDocument();
  });
});
