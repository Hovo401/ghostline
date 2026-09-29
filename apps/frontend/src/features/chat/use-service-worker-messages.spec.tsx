import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatUiStore } from "./chat-ui-store";
import { useServiceWorkerMessages } from "./use-service-worker-messages";

const acceptMock = vi.fn();

vi.mock("../../entities/call", () => ({
  useCallActions: () => ({ accept: acceptMock }),
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

function renderWithClient(): void {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  renderHook(
    () => {
      useServiceWorkerMessages();
    },
    { wrapper },
  );
}

describe("useServiceWorkerMessages", () => {
  beforeEach(() => {
    listeners.clear();
    acceptMock.mockClear();
    stubServiceWorker();
    useChatUiStore.setState({ selectedChatId: null });
  });

  afterEach(() => {
    // @ts-expect-error -- undoing the `defineProperty` stub above, not a real navigator mutation.
    delete navigator.serviceWorker;
  });

  it("selects the chat handed off from a message notification click", () => {
    renderWithClient();
    listeners.get("message")?.({
      data: { source: "ghostline-notification-click", chatId: "chat-1" },
    } as MessageEvent);
    expect(useChatUiStore.getState().selectedChatId).toBe("chat-1");
  });

  it("accepts the call handed off from an incoming-call notification click", () => {
    renderWithClient();
    listeners.get("message")?.({
      data: { source: "ghostline-notification-click", callId: "call-1", answer: true },
    } as MessageEvent);
    expect(acceptMock).toHaveBeenCalledWith("call-1");
  });

  it("ignores messages from a different source", () => {
    renderWithClient();
    listeners.get("message")?.({ data: { source: "something-else" } } as MessageEvent);
    expect(acceptMock).not.toHaveBeenCalled();
    expect(useChatUiStore.getState().selectedChatId).toBeNull();
  });
});
