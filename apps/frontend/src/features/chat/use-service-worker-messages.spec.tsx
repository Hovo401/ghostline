import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useServiceWorkerMessages } from "./use-service-worker-messages";

const acceptMock = vi.fn();

vi.mock("../../entities/call", () => ({
  useAnswerWhenIncoming: () => acceptMock,
}));

const listeners = new Map<string, (event: MessageEvent) => void>();

function stubServiceWorker(): void {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      addEventListener: (event: string, handler: (event: MessageEvent) => void) => {
        listeners.set(event, handler);
      },
      removeEventListener: (event: string) => {
        listeners.delete(event);
      },
    },
  });
}

function Probe() {
  useServiceWorkerMessages();
  return null;
}

async function renderInApp() {
  const rootRoute = createRootRoute();
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/app",
    component: Probe,
    validateSearch: (search: Record<string, unknown>) => search,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([appRoute]),
    history: createMemoryHistory({ initialEntries: ["/app"] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return router;
}

async function postMessage(data: unknown): Promise<void> {
  await act(async () => {
    listeners.get("message")?.({ data } as MessageEvent);
    await Promise.resolve();
  });
}

describe("useServiceWorkerMessages", () => {
  beforeEach(() => {
    listeners.clear();
    acceptMock.mockClear();
    stubServiceWorker();
  });

  afterEach(() => {
    // @ts-expect-error -- undoing the `defineProperty` stub above, not a real navigator mutation.
    delete navigator.serviceWorker;
  });

  it("opens the chat handed off from a message notification click", async () => {
    const router = await renderInApp();
    await postMessage({ source: "ghostline-notification-click", chatId: "chat-1" });
    expect(router.state.location.search).toEqual({ chat: "chat-1" });
  });

  it("answers the call handed off from an incoming-call notification click", async () => {
    await renderInApp();
    await postMessage({ source: "ghostline-notification-click", callId: "call-1", answer: true });
    expect(acceptMock).toHaveBeenCalledWith("call-1");
  });

  it("ignores messages from a different source", async () => {
    const router = await renderInApp();
    await postMessage({ source: "something-else" });
    expect(acceptMock).not.toHaveBeenCalled();
    expect(router.state.location.search).toEqual({});
  });
});
