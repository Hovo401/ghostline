import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCallStore, type Call } from "../../entities/call";
import type * as CallEntity from "../../entities/call";
import type { NativeCallCommand, NativeCallState, NativeLaunchAction } from "../../shared/native";

import { PENDING_ANSWER_TTL_MS, useNativeCallBridge } from "./use-native-call-bridge";

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  hangup: vi.fn(),
  setNativeCallState: vi.fn<(state: NativeCallState | null) => Promise<void>>(),
  consumeNativeLaunchAction: vi.fn<() => Promise<NativeLaunchAction | null>>(),
  listenForNativeCallCommands: vi.fn<(cb: (command: NativeCallCommand) => void) => () => void>(),
}));

vi.mock("../../entities/call", async (importOriginal) => {
  const actual = await importOriginal<typeof CallEntity>();
  return {
    ...actual,
    useCallActions: () => ({
      accept: mocks.accept,
      start: mocks.start,
      cancel: mocks.cancel,
      hangup: mocks.hangup,
      decline: vi.fn(),
      hangupMutate: vi.fn(),
    }),
  };
});

vi.mock("./use-call-peer", () => ({
  useCallPeer: () => ({ id: "peer", displayName: "Аня" }),
}));

vi.mock("../../shared/native", () => ({
  setNativeCallState: mocks.setNativeCallState,
  consumeNativeLaunchAction: mocks.consumeNativeLaunchAction,
  listenForNativeCallCommands: mocks.listenForNativeCallCommands,
}));

const baseCall: Call = {
  id: "call-1",
  chatId: "chat-1",
  callerId: "peer",
  calleeId: "me",
  video: true,
  status: "ringing",
  createdAt: "2026-01-01T10:00:00.000Z",
  answeredAt: null,
  endedAt: null,
};

let send: (command: NativeCallCommand) => void;
const unlisten = vi.fn();

function setup(micEnabled = true) {
  const toggleMic = vi.fn();
  const setMic = vi.fn<(enabled: boolean) => Promise<void>>().mockResolvedValue(undefined);
  const view = renderHook(
    (props: { micEnabled: boolean }) => {
      useNativeCallBridge({ micEnabled: props.micEnabled, toggleMic, setMic });
    },
    { initialProps: { micEnabled } },
  );
  return { toggleMic, setMic, ...view };
}

const answer = (callId = "call-1", video = true): NativeCallCommand => ({
  type: "answer",
  callId,
  chatId: "chat-1",
  video,
});

describe("useNativeCallBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCallStore.getState().reset();
    mocks.setNativeCallState.mockResolvedValue(undefined);
    mocks.consumeNativeLaunchAction.mockResolvedValue(null);
    mocks.listenForNativeCallCommands.mockImplementation((cb) => {
      send = cb;
      return unlisten;
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("state reporting", () => {
    it("reports each phase change, mute included, and never the same state twice", () => {
      const { rerender } = setup();
      // Idle at mount: nothing to say (and "no call" could tear down a call native just answered).
      expect(mocks.setNativeCallState).not.toHaveBeenCalled();

      act(() => {
        useCallStore.getState().receiveIncoming(baseCall);
      });
      expect(mocks.setNativeCallState).toHaveBeenLastCalledWith({
        callId: "call-1",
        chatId: "chat-1",
        phase: "incoming",
        video: true,
        peerName: "Аня",
        answeredAt: null,
        muted: false,
      });
      expect(mocks.setNativeCallState).toHaveBeenCalledTimes(1);

      rerender({ micEnabled: true });
      expect(mocks.setNativeCallState).toHaveBeenCalledTimes(1);

      const answeredAt = "2026-01-01T10:00:05.000Z";
      act(() => {
        useCallStore.setState({
          phase: "active",
          call: { ...baseCall, status: "active", answeredAt },
        });
      });
      expect(mocks.setNativeCallState).toHaveBeenLastCalledWith(
        expect.objectContaining({ phase: "active", answeredAt: Date.parse(answeredAt) }),
      );

      rerender({ micEnabled: false });
      expect(mocks.setNativeCallState).toHaveBeenLastCalledWith(
        expect.objectContaining({ phase: "active", muted: true }),
      );
      expect(mocks.setNativeCallState).toHaveBeenCalledTimes(3);

      act(() => {
        useCallStore.getState().reset();
      });
      expect(mocks.setNativeCallState).toHaveBeenLastCalledWith(null);
      expect(mocks.setNativeCallState).toHaveBeenCalledTimes(4);
    });

    it("sends nothing for a draft that has no call id yet", () => {
      setup();
      act(() => {
        useCallStore.getState().startDraft("chat-1", false);
      });
      expect(mocks.setNativeCallState).not.toHaveBeenCalled();
    });
  });

  describe("answer", () => {
    it("accepts only once the call is ringing, with the chosen video intent", () => {
      setup();
      act(() => {
        send(answer("call-1", false));
      });
      expect(mocks.accept).not.toHaveBeenCalled();

      act(() => {
        useCallStore.getState().receiveIncoming(baseCall);
      });
      expect(mocks.accept).toHaveBeenCalledExactlyOnceWith("call-1");
      expect(useCallStore.getState().localVideoIntent).toBe(false);
    });

    it("accepts at once when the call is already ringing", () => {
      setup();
      act(() => {
        useCallStore.getState().receiveIncoming(baseCall);
      });
      act(() => {
        send(answer("call-1", true));
      });
      expect(mocks.accept).toHaveBeenCalledExactlyOnceWith("call-1");
      expect(useCallStore.getState().localVideoIntent).toBe(true);
    });

    it("picks up the launch action of a cold start", async () => {
      mocks.consumeNativeLaunchAction.mockResolvedValue({
        type: "answer",
        callId: "call-1",
        chatId: "chat-1",
        video: false,
      });
      setup();
      await act(async () => {
        await Promise.resolve();
      });
      act(() => {
        useCallStore.getState().receiveIncoming(baseCall);
      });
      expect(mocks.accept).toHaveBeenCalledExactlyOnceWith("call-1");
    });

    it("never accepts twice for the same call", () => {
      setup();
      act(() => {
        send(answer());
        send(answer());
        useCallStore.getState().receiveIncoming(baseCall);
      });
      act(() => {
        send(answer());
        useCallStore.getState().receiveIncoming(baseCall);
      });
      expect(mocks.accept).toHaveBeenCalledTimes(1);
    });

    it("ignores a different call", () => {
      setup();
      act(() => {
        send(answer("call-2"));
        useCallStore.getState().receiveIncoming(baseCall);
      });
      expect(mocks.accept).not.toHaveBeenCalled();
    });

    it("forgets an answer older than the time limit", () => {
      vi.useFakeTimers();
      setup();
      act(() => {
        send(answer());
      });
      vi.advanceTimersByTime(PENDING_ANSWER_TTL_MS + 1);
      act(() => {
        useCallStore.getState().receiveIncoming(baseCall);
      });
      expect(mocks.accept).not.toHaveBeenCalled();
    });

    it("forgets an answer for a call that already ended", () => {
      setup();
      act(() => {
        send(answer());
      });
      act(() => {
        useCallStore.setState({ phase: "ended", call: { ...baseCall, status: "missed" } });
      });
      act(() => {
        useCallStore.getState().receiveIncoming(baseCall);
      });
      expect(mocks.accept).not.toHaveBeenCalled();
    });
  });

  describe("callback", () => {
    const callback: NativeCallCommand = { type: "callback", chatId: "chat-9", video: true };

    it("starts a call only while idle", () => {
      setup();
      act(() => {
        send(callback);
      });
      expect(mocks.start).toHaveBeenCalledExactlyOnceWith({ chatId: "chat-9", video: true });

      mocks.start.mockClear();
      act(() => {
        useCallStore.getState().receiveIncoming(baseCall);
      });
      act(() => {
        send(callback);
      });
      expect(mocks.start).not.toHaveBeenCalled();
    });

    it("dismisses the ended screen first, then starts", () => {
      setup();
      act(() => {
        useCallStore.setState({ phase: "ended", call: baseCall, endReason: "ended" });
      });
      act(() => {
        send(callback);
      });
      expect(useCallStore.getState().phase).toBe("idle");
      expect(mocks.start).toHaveBeenCalledExactlyOnceWith({ chatId: "chat-9", video: true });
    });

    it("is ignored in every in-progress phase", () => {
      setup();
      for (const phase of [
        "outgoing",
        "incoming",
        "connecting",
        "active",
        "reconnecting",
      ] as const) {
        act(() => {
          useCallStore.setState({ phase, call: baseCall });
        });
        act(() => {
          send(callback);
        });
      }
      expect(mocks.start).not.toHaveBeenCalled();
    });

    it("also works as a cold-start launch action", async () => {
      mocks.consumeNativeLaunchAction.mockResolvedValue({
        type: "callback",
        chatId: "chat-9",
        video: false,
      });
      setup();
      await act(async () => {
        await Promise.resolve();
      });
      expect(mocks.start).toHaveBeenCalledExactlyOnceWith({ chatId: "chat-9", video: false });
    });
  });

  describe("hangup", () => {
    it("cancels an outgoing call and hangs up one that is connected", () => {
      setup();
      act(() => {
        useCallStore.setState({ phase: "outgoing", call: baseCall });
      });
      act(() => {
        send({ type: "hangup" });
      });
      expect(mocks.cancel).toHaveBeenCalledTimes(1);
      expect(mocks.hangup).not.toHaveBeenCalled();

      act(() => {
        useCallStore.setState({ phase: "active" });
      });
      act(() => {
        send({ type: "hangup" });
      });
      expect(mocks.hangup).toHaveBeenCalledTimes(1);
    });

    it("does nothing without a call", () => {
      setup();
      act(() => {
        send({ type: "hangup" });
      });
      expect(mocks.cancel).not.toHaveBeenCalled();
      expect(mocks.hangup).not.toHaveBeenCalled();
    });
  });

  it("toggleMute toggles the microphone", () => {
    const { toggleMic } = setup();
    act(() => {
      send({ type: "toggleMute" });
    });
    expect(toggleMic).toHaveBeenCalledTimes(1);
  });

  it("toggleMute is ignored while the call is held", () => {
    const { toggleMic } = setup();
    act(() => {
      useCallStore.setState({ phase: "active", call: baseCall, held: true });
    });
    act(() => {
      send({ type: "toggleMute" });
    });
    expect(toggleMic).not.toHaveBeenCalled();
  });

  it("open restores a minimized call screen", () => {
    setup();
    act(() => {
      useCallStore.setState({ phase: "active", call: baseCall, minimized: true });
    });
    act(() => {
      send({ type: "open" });
    });
    expect(useCallStore.getState().minimized).toBe(false);
  });

  describe("hold and resume", () => {
    function activate() {
      act(() => {
        useCallStore.setState({ phase: "active", call: baseCall });
      });
    }

    it("mutes the mic and marks the call held, then restores the mic on resume", () => {
      const { setMic } = setup(true);
      activate();
      act(() => {
        send({ type: "hold" });
      });
      expect(setMic).toHaveBeenLastCalledWith(false);
      expect(useCallStore.getState().held).toBe(true);

      act(() => {
        send({ type: "resume" });
      });
      expect(setMic).toHaveBeenLastCalledWith(true);
      expect(setMic).toHaveBeenCalledTimes(2);
      expect(useCallStore.getState().held).toBe(false);
    });

    // Regression: `micEnabled` only updates after the async mic request, so a toggle-based
    // resume right behind a hold saw "still on" and left the mic off.
    it("hold then resume before the mic request settles ends with the mic on", () => {
      const { setMic } = setup(true);
      setMic.mockReturnValue(new Promise<void>(() => undefined));
      activate();
      act(() => {
        send({ type: "hold" });
        send({ type: "resume" });
      });
      expect(setMic.mock.calls).toEqual([[false], [true]]);
      expect(useCallStore.getState().held).toBe(false);
    });

    it("still holds the call when muting the mic fails", async () => {
      const { setMic } = setup(true);
      setMic.mockRejectedValue(new Error("device busy"));
      activate();
      act(() => {
        send({ type: "hold" });
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(useCallStore.getState().held).toBe(true);
      act(() => {
        send({ type: "resume" });
      });
      expect(setMic).toHaveBeenLastCalledWith(true);
      expect(useCallStore.getState().held).toBe(false);
    });

    it("leaves a mic the user had muted muted after resume", () => {
      const { setMic } = setup(false);
      activate();
      act(() => {
        send({ type: "hold" });
      });
      expect(useCallStore.getState().held).toBe(true);
      act(() => {
        send({ type: "resume" });
      });
      expect(setMic).not.toHaveBeenCalledWith(true);
      expect(useCallStore.getState().held).toBe(false);
    });

    it("holds a reconnecting call, but ignores hold in any other phase", () => {
      const { setMic } = setup(true);
      for (const phase of ["idle", "outgoing", "incoming", "connecting", "ended"] as const) {
        act(() => {
          useCallStore.setState({ phase, call: baseCall });
        });
        act(() => {
          send({ type: "hold" });
        });
      }
      expect(setMic).not.toHaveBeenCalled();
      expect(useCallStore.getState().held).toBe(false);

      act(() => {
        useCallStore.setState({ phase: "reconnecting" });
      });
      act(() => {
        send({ type: "hold" });
      });
      expect(useCallStore.getState().held).toBe(true);
    });

    it("a second hold keeps the remembered mic, and resume without hold is a no-op", () => {
      const { setMic, rerender } = setup(true);
      act(() => {
        send({ type: "resume" });
      });
      expect(setMic).not.toHaveBeenCalled();

      activate();
      act(() => {
        send({ type: "hold" });
      });
      rerender({ micEnabled: false });
      act(() => {
        send({ type: "hold" });
      });
      act(() => {
        send({ type: "resume" });
      });
      expect(setMic.mock.calls).toEqual([[false], [true]]);
    });
  });

  it("stops listening on unmount", () => {
    setup().unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("is inert where the native wrappers are no-ops (browser, old APK)", async () => {
    mocks.listenForNativeCallCommands.mockReturnValue(() => undefined);
    setup();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.setNativeCallState).not.toHaveBeenCalled();
  });
});
