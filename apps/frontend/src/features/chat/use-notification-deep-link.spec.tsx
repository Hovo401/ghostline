import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNotificationDeepLink } from "./use-notification-deep-link";

const acceptMock = vi.fn();

vi.mock("../../entities/call", () => ({
  useAnswerWhenIncoming: () => acceptMock,
}));

function Probe() {
  useNotificationDeepLink();
  return null;
}

async function renderAt(path: string) {
  const rootRoute = createRootRoute({
    component: Probe,
    validateSearch: (search: Record<string, unknown>) => search,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = new QueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return { view, router };
}

describe("useNotificationDeepLink", () => {
  beforeEach(() => {
    acceptMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("leaves ?chat= alone — it's the open chat's own URL, not a one-shot", async () => {
    const { router } = await renderAt("/app?chat=chat-1");
    expect(acceptMock).not.toHaveBeenCalled();
    expect(router.state.location.search).toEqual({ chat: "chat-1" });
  });

  it("answers the call from ?call=&answer=1 and clears the params", async () => {
    const { router } = await renderAt("/app?call=call-1&answer=1");
    expect(acceptMock).toHaveBeenCalledWith("call-1");
    expect(router.state.location.search).toEqual({});
  });

  it("keeps ?chat= while clearing the call params", async () => {
    const { router } = await renderAt("/app?chat=chat-1&call=call-1&answer=1");
    expect(acceptMock).toHaveBeenCalledWith("call-1");
    expect(router.state.location.search).toEqual({ chat: "chat-1" });
  });

  it("does nothing without deep-link params", async () => {
    const { router } = await renderAt("/app");
    expect(acceptMock).not.toHaveBeenCalled();
    expect(router.state.location.search).toEqual({});
  });
});
