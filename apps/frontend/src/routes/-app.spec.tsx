import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "../routeTree.gen";
import { useSessionStore } from "../shared/api/session-store";

// Regression for "opening settings mid-call kills the audio": settings used
// to be a sibling route of `/app`, so navigating there unmounted the layout
// that owns the LiveKit session (`CallRoot`) and its cleanup hung up the
// call. Runs on the real generated route tree so a route moving back out
// from under `/app` fails here. The features are stubbed — this is about
// what stays mounted, not what they render.
const lifecycle = vi.hoisted(() => ({ callRootMounts: 0, callRootUnmounts: 0, sessions: 0 }));

vi.mock("../entities/session", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureSession: () => Promise.resolve(),
}));

vi.mock("../features/call", () => ({
  CallMiniBar: () => null,
  CallRoot: function CallRootStub() {
    useEffect(() => {
      lifecycle.callRootMounts += 1;
      return () => {
        lifecycle.callRootUnmounts += 1;
      };
    }, []);
    return <audio data-testid="remote-audio" />;
  },
}));

vi.mock("../features/chat", () => ({
  Chat: () => <p>chat list</p>,
  useMessengerSession: function useMessengerSessionStub() {
    useEffect(() => {
      lifecycle.sessions += 1;
    }, []);
  },
}));

vi.mock("../features/settings", () => ({
  Settings: () => <p>settings screen</p>,
  isSettingsTab: () => false,
}));
vi.mock("../features/media-viewer", () => ({ MediaViewer: () => null }));

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("/app layout", () => {
  beforeEach(() => {
    lifecycle.callRootMounts = 0;
    lifecycle.callRootUnmounts = 0;
    lifecycle.sessions = 0;
    useSessionStore.setState({ status: "authenticated", accessToken: "token", user: null });
  });

  afterEach(() => {
    cleanup();
    useSessionStore.setState({ status: "checking", accessToken: null, user: null });
  });

  it("keeps the call and the messenger session mounted across settings and back", async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/app"] }),
    });
    render(<RouterProvider router={router} />);
    await settle();
    expect(screen.getByText("chat list")).toBeInTheDocument();

    await act(async () => {
      await router.navigate({ to: "/app/settings" });
    });
    await settle();
    expect(screen.getByText("settings screen")).toBeInTheDocument();
    expect(screen.getByTestId("remote-audio")).toBeInTheDocument();

    router.history.back();
    await settle();
    expect(screen.getByText("chat list")).toBeInTheDocument();

    expect(lifecycle.callRootMounts).toBe(1);
    expect(lifecycle.callRootUnmounts).toBe(0);
    expect(lifecycle.sessions).toBe(1);
  });
});
