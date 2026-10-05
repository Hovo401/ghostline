import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type * as LivekitClient from "livekit-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCallStore, type Call } from "../../entities/call";
import type * as CallEntity from "../../entities/call";

import { useCallSession } from "./use-call-session";

type Handler = (...args: unknown[]) => void;

const hangupMutate = vi.hoisted(() => vi.fn());

const { FakeRoom, rooms, cameraEnabledImpl } = vi.hoisted(() => {
  const rooms: InstanceType<typeof FakeRoom>[] = [];
  const cameraEnabledImpl = vi.fn<() => Promise<void>>();

  class FakeRoom {
    handlers = new Map<string, Handler>();
    remoteParticipants = new Map();
    localParticipant = {
      setMicrophoneEnabled: vi.fn(() => Promise.resolve()),
      setCameraEnabled: vi.fn(() => cameraEnabledImpl()),
    };
    constructor() {
      rooms.push(this);
    }
    on(event: string, handler: Handler) {
      this.handlers.set(event, handler);
      return this;
    }
    off() {
      return this;
    }
    connect() {
      return Promise.resolve();
    }
    disconnect() {
      return Promise.resolve();
    }
    emit(event: string, ...args: unknown[]) {
      this.handlers.get(event)?.(...args);
    }
  }

  return { FakeRoom, rooms, cameraEnabledImpl };
});

vi.mock("livekit-client", async (importOriginal) => {
  const actual = await importOriginal<typeof LivekitClient>();
  return { ...actual, Room: FakeRoom };
});

vi.mock("../../entities/call", async (importOriginal) => {
  const actual = await importOriginal<typeof CallEntity>();
  return {
    ...actual,
    buildRoomOptions: () => ({}),
    resolveLivekitUrl: (url: string) => url,
    useCallActions: () => ({ hangupMutate }),
  };
});

function call(): Call {
  return {
    id: "call-a",
    chatId: "chat-1",
    callerId: "me",
    calleeId: "peer-1",
    video: true,
    status: "active",
    createdAt: new Date().toISOString(),
    answeredAt: new Date().toISOString(),
    endedAt: null,
    callerEndpointId: null,
    calleeEndpointId: null,
  };
}

describe("useCallSession", () => {
  beforeEach(() => {
    rooms.length = 0;
    hangupMutate.mockReset();
    cameraEnabledImpl.mockReset();
    useCallStore.setState({
      phase: "active",
      call: call(),
      livekitUrl: "wss://lk",
      token: "tok",
      localVideoIntent: true,
    });
  });

  afterEach(cleanup);

  // Regression: livekit-client rejects `setCameraEnabled` after its engine
  // timeout on a weak link but still finishes the publish later — the UI
  // must follow the actual publish, not the stale rejection.
  it("clears the camera error once a publish that timed out completes after all", async () => {
    cameraEnabledImpl.mockRejectedValue(
      new Error("publishing rejected as engine not connected within timeout"),
    );
    const { result } = renderHook(() => useCallSession());

    await waitFor(() => {
      expect(result.current.mediaError.camera).toMatch(/engine not connected/);
    });
    expect(result.current.cameraEnabled).toBe(false);

    const track = { kind: "video" };
    const room = rooms[0];
    if (!room) throw new Error("room not created");
    act(() => {
      room.emit("localTrackPublished", { kind: "video", track });
    });

    expect(result.current.mediaError.camera).toBeNull();
    expect(result.current.cameraEnabled).toBe(true);
    expect(result.current.localVideoTrack).toBe(track);
  });

  describe("link loss", () => {
    async function mountedRoom() {
      cameraEnabledImpl.mockResolvedValue(undefined);
      const hook = renderHook(() => useCallSession());
      await waitFor(() => {
        expect(rooms[0]).toBeDefined();
      });
      const room = rooms[0];
      if (!room) throw new Error("room not created");
      return { ...hook, room };
    }

    it("goes back to active when the room reconnects with the peer still in it", async () => {
      const { room } = await mountedRoom();
      useCallStore.setState({ phase: "reconnecting", remoteJoined: true });
      room.remoteParticipants.set("peer-1", {});

      act(() => {
        room.emit("reconnected");
      });

      expect(useCallStore.getState().phase).toBe("active");
    });

    it("hangs up after 30 s of reconnecting, and not before", async () => {
      await mountedRoom();
      vi.useFakeTimers();
      try {
        act(() => {
          useCallStore.setState({ phase: "reconnecting" });
        });
        act(() => {
          vi.advanceTimersByTime(29_000);
        });
        expect(useCallStore.getState().phase).toBe("reconnecting");

        act(() => {
          vi.advanceTimersByTime(1_500);
        });
        expect(useCallStore.getState().phase).toBe("ended");
        expect(useCallStore.getState().endReason).toBe("connection_lost");
        expect(hangupMutate).toHaveBeenCalledWith("call-a");
      } finally {
        vi.useRealTimers();
      }
    });

    it("recovering before the deadline cancels the hang-up", async () => {
      const { room } = await mountedRoom();
      vi.useFakeTimers();
      try {
        useCallStore.setState({ remoteJoined: true });
        room.remoteParticipants.set("peer-1", {});
        act(() => {
          useCallStore.setState({ phase: "reconnecting" });
        });
        act(() => {
          room.emit("reconnected");
        });
        act(() => {
          vi.advanceTimersByTime(60_000);
        });
        expect(useCallStore.getState().phase).toBe("active");
        expect(hangupMutate).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("a disconnect we did not ask for ends the call as failed and hangs up", async () => {
      const { room } = await mountedRoom();

      act(() => {
        room.emit("disconnected", 2);
      });

      expect(useCallStore.getState().phase).toBe("ended");
      expect(useCallStore.getState().endReason).toBe("failed");
      expect(useCallStore.getState().token).toBeNull();
      expect(hangupMutate).toHaveBeenCalledWith("call-a");
    });

    it("is not a failure: no failed reason, no extra hangup", async () => {
      const { room } = await mountedRoom();
      useCallStore.setState({ phase: "active", remoteJoined: true });

      act(() => {
        room.emit("disconnected", 5); // DisconnectReason.ROOM_DELETED
      });

      expect(useCallStore.getState().phase).toBe("active");
      expect(hangupMutate).not.toHaveBeenCalled();
    });
  });

  describe("setMic", () => {
    async function mounted() {
      cameraEnabledImpl.mockResolvedValue(undefined);
      const hook = renderHook(() => useCallSession());
      await waitFor(() => {
        expect(rooms[0]).toBeDefined();
      });
      const room = rooms[0];
      if (!room) throw new Error("room not created");
      const mic = room.localParticipant.setMicrophoneEnabled;
      // The join itself turns the mic on — start counting after that.
      await waitFor(() => {
        expect(mic).toHaveBeenCalled();
      });
      mic.mockClear();
      return { ...hook, mic };
    }

    it("applies requests in order, so the last one wins even if the first is slow", async () => {
      const { result, mic } = await mounted();
      let releaseFirst: () => void = () => undefined;
      mic.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = resolve;
          }),
      );
      let both: Promise<unknown> = Promise.resolve();
      act(() => {
        both = Promise.all([result.current.setMic(false), result.current.setMic(true)]);
      });
      await act(async () => {
        await Promise.resolve();
        releaseFirst();
        await both;
      });
      expect(mic.mock.calls).toEqual([[false], [true]]);
      expect(result.current.micEnabled).toBe(true);
    });

    it("is idempotent and keeps the real state when the request fails", async () => {
      const { result, mic } = await mounted();
      mic.mockRejectedValueOnce(new Error("device busy"));
      await act(async () => {
        await result.current.setMic(false);
      });
      expect(result.current.micEnabled).toBe(true);
      expect(result.current.mediaError.microphone).toBe("device busy");

      await act(async () => {
        await result.current.setMic(false);
        await result.current.setMic(false);
      });
      expect(result.current.micEnabled).toBe(false);
      expect(result.current.mediaError.microphone).toBeNull();
    });
  });
});
