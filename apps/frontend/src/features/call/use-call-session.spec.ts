import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type * as LivekitClient from "livekit-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCallStore, type Call } from "../../entities/call";
import type * as CallEntity from "../../entities/call";

import { useCallSession } from "./use-call-session";

type Handler = (...args: unknown[]) => void;

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
    useCallActions: () => ({ hangupMutate: vi.fn() }),
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
  };
}

describe("useCallSession", () => {
  beforeEach(() => {
    rooms.length = 0;
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
