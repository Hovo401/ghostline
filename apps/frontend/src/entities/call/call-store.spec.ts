import { beforeEach, describe, expect, it } from "vitest";

import { useCallStore } from "./call-store";
import type { ActiveCall, Call, CallJoin } from "./call.types";

function call(overrides: Partial<Call> = {}): Call {
  return {
    id: "call-a",
    chatId: "chat-1",
    callerId: "user-a",
    calleeId: "user-b",
    video: false,
    status: "ringing",
    createdAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    ...overrides,
  };
}

const RESET_STATE = {
  phase: "idle" as const,
  call: null,
  livekitUrl: null,
  token: null,
  minimized: false,
  localVideoIntent: true,
  draft: null,
  endReason: null,
  remoteJoined: false,
};

beforeEach(() => {
  useCallStore.setState(RESET_STATE);
});

describe("useCallStore", () => {
  it("starts idle", () => {
    expect(useCallStore.getState().phase).toBe("idle");
  });

  it("startDraft moves to outgoing with a draft and no call yet", () => {
    useCallStore.getState().startDraft("chat-1", true);
    const state = useCallStore.getState();
    expect(state.phase).toBe("outgoing");
    expect(state.draft).toEqual({ chatId: "chat-1", video: true });
    expect(state.call).toBeNull();
  });

  it("applyOutgoingJoin fills in the call/credentials once the draft resolves", () => {
    useCallStore.getState().startDraft("chat-1", true);
    const join: CallJoin = {
      call: call({ status: "ringing" }),
      livekitUrl: "wss://lk",
      token: "t",
    };
    useCallStore.getState().applyOutgoingJoin(join);
    const state = useCallStore.getState();
    expect(state.phase).toBe("outgoing");
    expect(state.call?.id).toBe("call-a");
    expect(state.livekitUrl).toBe("wss://lk");
    expect(state.token).toBe("t");
    expect(state.draft).toBeNull();
  });

  it("applyOutgoingJoin is a no-op once the user already cancelled locally", () => {
    useCallStore.getState().startDraft("chat-1", true);
    useCallStore.getState().endLocally("cancelled");
    const join: CallJoin = { call: call(), livekitUrl: "wss://lk", token: "t" };
    useCallStore.getState().applyOutgoingJoin(join);
    expect(useCallStore.getState().call).toBeNull();
    expect(useCallStore.getState().phase).toBe("ended");
  });

  it("receiveIncoming moves to incoming while idle", () => {
    useCallStore.getState().receiveIncoming(call());
    expect(useCallStore.getState().phase).toBe("incoming");
  });

  it("receiveIncoming is a no-op for a different call while this one is in progress", () => {
    useCallStore.getState().startDraft("chat-1", false);
    useCallStore
      .getState()
      .applyOutgoingJoin({ call: call({ id: "call-a" }), livekitUrl: "wss://lk", token: "t" });
    useCallStore.getState().receiveIncoming(call({ id: "call-b" }));
    expect(useCallStore.getState().call?.id).toBe("call-a");
    expect(useCallStore.getState().phase).toBe("outgoing");
  });

  it("receiveIncoming still applies once the previous call has ended", () => {
    useCallStore.getState().receiveIncoming(call({ id: "call-a" }));
    useCallStore.getState().updateCall(call({ id: "call-a", status: "cancelled" }));
    useCallStore.getState().receiveIncoming(call({ id: "call-b" }));
    expect(useCallStore.getState().call?.id).toBe("call-b");
    expect(useCallStore.getState().phase).toBe("incoming");
  });

  it("beginConnecting/applyJoin move the callee from incoming to connecting with credentials", () => {
    useCallStore.getState().receiveIncoming(call());
    useCallStore.getState().beginConnecting();
    expect(useCallStore.getState().phase).toBe("connecting");
    useCallStore
      .getState()
      .applyJoin({ call: call({ status: "active" }), livekitUrl: "wss://lk", token: "t" });
    expect(useCallStore.getState().token).toBe("t");
    expect(useCallStore.getState().phase).toBe("connecting");
  });

  it("updateCall ignores a call this device isn't tracking", () => {
    useCallStore.getState().receiveIncoming(call({ id: "call-a" }));
    useCallStore.getState().updateCall(call({ id: "call-b", status: "active" }));
    expect(useCallStore.getState().call?.id).toBe("call-a");
  });

  it("updateCall to active while remoteJoined is false moves an outgoing call to connecting, not active", () => {
    useCallStore.getState().receiveIncoming(call({ id: "call-a" }));
    useCallStore.setState({ phase: "outgoing" });
    useCallStore.getState().updateCall(call({ id: "call-a", status: "active" }));
    const state = useCallStore.getState();
    expect(state.call?.status).toBe("active");
    expect(state.phase).toBe("connecting");
  });

  it("updateCall to active moves to active once remoteJoined is already true", () => {
    useCallStore.getState().receiveIncoming(call({ id: "call-a" }));
    useCallStore.setState({ phase: "connecting", remoteJoined: true });
    useCallStore.getState().updateCall(call({ id: "call-a", status: "active" }));
    expect(useCallStore.getState().phase).toBe("active");
  });

  it("setRemoteJoined flips phase to active only once the call is also server-side active", () => {
    useCallStore.getState().receiveIncoming(call({ id: "call-a" }));
    useCallStore.setState({ phase: "connecting" });
    useCallStore.getState().setRemoteJoined();
    expect(useCallStore.getState().remoteJoined).toBe(true);
    expect(useCallStore.getState().phase).toBe("connecting");

    useCallStore.getState().updateCall(call({ id: "call-a", status: "active" }));
    expect(useCallStore.getState().phase).toBe("active");
  });

  it("updateCall to a final status moves the phase to ended with a matching reason", () => {
    useCallStore.getState().receiveIncoming(call({ id: "call-a" }));
    useCallStore.getState().updateCall(call({ id: "call-a", status: "declined" }));
    expect(useCallStore.getState().phase).toBe("ended");
    expect(useCallStore.getState().endReason).toBe("declined");
  });

  it("setReconnecting updates the phase only", () => {
    useCallStore.getState().setReconnecting();
    expect(useCallStore.getState().phase).toBe("reconnecting");
  });

  it("endLocally flips to ended with the given reason synchronously", () => {
    useCallStore.getState().endLocally("busy");
    expect(useCallStore.getState().phase).toBe("ended");
    expect(useCallStore.getState().endReason).toBe("busy");
  });

  it("minimize/restore toggle the minimized flag", () => {
    useCallStore.getState().minimize();
    expect(useCallStore.getState().minimized).toBe(true);
    useCallStore.getState().restore();
    expect(useCallStore.getState().minimized).toBe(false);
  });

  it("setLocalVideoIntent flips the flag; a fresh call always resets it to true", () => {
    useCallStore.getState().setLocalVideoIntent(false);
    expect(useCallStore.getState().localVideoIntent).toBe(false);
    useCallStore.getState().startDraft("chat-1", true);
    expect(useCallStore.getState().localVideoIntent).toBe(true);

    useCallStore.getState().setLocalVideoIntent(false);
    useCallStore.getState().reset();
    useCallStore.getState().receiveIncoming(call({ id: "call-c" }));
    expect(useCallStore.getState().localVideoIntent).toBe(true);
  });

  describe("applyActiveCall", () => {
    function activeCall(overrides: Partial<ActiveCall> = {}): ActiveCall {
      return { call: call(), livekitUrl: "wss://lk", token: "t", ...overrides };
    }

    it("applies while idle, connecting when the call is already active", () => {
      useCallStore.getState().applyActiveCall(activeCall({ call: call({ status: "active" }) }));
      const state = useCallStore.getState();
      expect(state.phase).toBe("connecting");
      expect(state.token).toBe("t");
    });

    it("applies as outgoing when the caller reloaded mid-ring (pre-joined, token present)", () => {
      useCallStore.getState().applyActiveCall(activeCall({ call: call({ status: "ringing" }) }));
      expect(useCallStore.getState().phase).toBe("outgoing");
    });

    it("applies as incoming with no LiveKit credentials when token is null (callee, still ringing)", () => {
      useCallStore.getState().applyActiveCall(activeCall({ token: null }));
      const state = useCallStore.getState();
      expect(state.phase).toBe("incoming");
      expect(state.livekitUrl).toBeNull();
      expect(state.token).toBeNull();
    });

    it("never clobbers a call already in progress in this tab", () => {
      useCallStore.getState().receiveIncoming(call({ id: "call-a" }));
      useCallStore.getState().applyActiveCall(activeCall({ call: call({ id: "call-b" }) }));
      expect(useCallStore.getState().call?.id).toBe("call-a");
    });
  });

  it("reset clears everything back to idle", () => {
    useCallStore.getState().startDraft("chat-1", true);
    useCallStore.getState().minimize();
    useCallStore.getState().reset();
    expect(useCallStore.getState()).toMatchObject(RESET_STATE);
  });
});
