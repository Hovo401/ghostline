import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatUiStore } from "./chat-ui-store";
import { useNotificationDeepLink } from "./use-notification-deep-link";

const acceptMock = vi.fn();

vi.mock("../../entities/call", () => ({
  useCallActions: () => ({ accept: acceptMock }),
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
    useChatUiStore.setState({ selectedChatId: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("selects the chat from ?chat= and clears the param", async () => {
    const { router } = await renderAt("/app?chat=chat-1");
    expect(useChatUiStore.getState().selectedChatId).toBe("chat-1");
    expect(router.state.location.search).toEqual({});
  });

  it("accepts the call from ?call=&answer=1 and clears the params", async () => {
    const { router } = await renderAt("/app?call=call-1&answer=1");
    expect(acceptMock).toHaveBeenCalledWith("call-1");
    expect(router.state.location.search).toEqual({});
  });

  it("does nothing without deep-link params", async () => {
    await renderAt("/app");
    expect(acceptMock).not.toHaveBeenCalled();
    expect(useChatUiStore.getState().selectedChatId).toBeNull();
  });
});
