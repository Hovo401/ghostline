import type { Call } from "@ghostline/contracts";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCallStore } from "./call-store";
import { useCallRealtime } from "./use-call-realtime";

const listeners = new Map<string, (payload: unknown) => void>();
const socket = {
  on: vi.fn((event: string, handler: (payload: unknown) => void) => {
    listeners.set(event, handler);
  }),
  off: vi.fn(),
  connected: true,
};

const resync = vi.hoisted(() => vi.fn());
vi.mock("./active-call", () => ({ resyncActiveCall: resync }));

vi.mock("../../shared/api/socket-client", () => ({
  getSocketClient: () => socket,
}));

function call(overrides: Partial<Call> = {}): Call {
  return { ...baseCall(), ...overrides };
}

function baseCall(): Call {
  return {
    id: "call-a",
    chatId: "chat-1",
    callerId: "user-a",
    calleeId: "user-b",
    video: false,
    status: "ringing" as const,
    createdAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    callerEndpointId: null,
    calleeEndpointId: null,
  };
}

describe("useCallRealtime", () => {
  beforeEach(() => {
    listeners.clear();
    useCallStore.setState({
      phase: "idle",
      call: null,
      livekitUrl: null,
      token: null,
      minimized: false,
    });
  });

  it("subscribes call:incoming and call:updated and unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => {
      useCallRealtime();
    });

    expect(socket.on).toHaveBeenCalledWith("call:incoming", expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith("call:updated", expect.any(Function));

    unmount();
    expect(socket.off).toHaveBeenCalledWith("call:incoming", expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith("call:updated", expect.any(Function));
  });

  it("re-syncs with GET /calls/active after a reconnect, not on the first connect", () => {
    resync.mockReset();
    socket.connected = false;
    renderHook(() => {
      useCallRealtime();
    });

    listeners.get("connect")?.(undefined);
    expect(resync).not.toHaveBeenCalled();

    listeners.get("connect")?.(undefined);
    expect(resync).toHaveBeenCalledTimes(1);
    socket.connected = true;
  });

  it("call:incoming moves the store to incoming", () => {
    renderHook(() => {
      useCallRealtime();
    });

    listeners.get("call:incoming")?.(call());

    expect(useCallStore.getState().phase).toBe("incoming");
    expect(useCallStore.getState().call?.id).toBe("call-a");
  });

  it("call:updated with a final status ends the tracked call", () => {
    useCallStore.getState().receiveIncoming(call());
    renderHook(() => {
      useCallRealtime();
    });

    listeners.get("call:updated")?.(call({ status: "declined" }));

    expect(useCallStore.getState().phase).toBe("ended");
  });
});
