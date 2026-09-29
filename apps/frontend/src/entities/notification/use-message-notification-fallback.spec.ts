import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionStore } from "../../shared/api/session-store";

import { useMessageNotificationFallback } from "./use-message-notification-fallback";

const listeners = new Map<string, (payload: unknown) => void>();
const socket = {
  on: vi.fn((event: string, handler: (payload: unknown) => void) => {
    listeners.set(event, handler);
  }),
  off: vi.fn(),
};

vi.mock("../../shared/api/socket-client", () => ({
  getSocketClient: () => socket,
}));

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    chatId: "chat-1",
    senderId: "peer-1",
    type: "text",
    text: "Привет!",
    ...overrides,
  };
}

describe("useMessageNotificationFallback", () => {
  const notificationCtor = vi.fn();

  beforeEach(() => {
    listeners.clear();
    useSessionStore.setState({
      status: "authenticated",
      accessToken: "t",
      user: {
        id: "me",
        username: "me",
        displayName: "Я",
        avatarKey: null,
        avatarUrl: null,
        bio: null,
        online: true,
        lastSeenAt: null,
      },
    });
    notificationCtor.mockClear();
    class FakeNotification {
      static permission = "granted";
      onclick: (() => void) | null = null;
      close = vi.fn();
      constructor(...args: unknown[]) {
        notificationCtor(...args);
      }
    }
    vi.stubGlobal("Notification", FakeNotification);
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("does nothing while disabled", () => {
    renderHook(() => {
      useMessageNotificationFallback(false);
    });
    expect(socket.on).not.toHaveBeenCalled();
  });

  it("shows a tab-hidden notification for a message from someone else", () => {
    renderHook(() => {
      useMessageNotificationFallback(true);
    });
    listeners.get("message:new")?.(message());
    expect(notificationCtor).toHaveBeenCalledWith(
      "Ghostline",
      expect.objectContaining({ body: "Привет!", tag: "chat:chat-1" }),
    );
  });

  it("ignores the sender's own message echo", () => {
    renderHook(() => {
      useMessageNotificationFallback(true);
    });
    listeners.get("message:new")?.(message({ senderId: "me" }));
    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("stays quiet while the tab is visible", () => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    renderHook(() => {
      useMessageNotificationFallback(true);
    });
    listeners.get("message:new")?.(message());
    expect(notificationCtor).not.toHaveBeenCalled();
  });
});
