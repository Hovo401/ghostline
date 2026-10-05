import { beforeEach, describe, expect, it } from "vitest";

import { useSessionStore } from "../../shared/api/session-store";
import { useToastStore } from "../../shared/ui/toast-store";

import { selectCallBusy, useCallStore } from "./call-store";
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
    callerEndpointId: null,
    calleeEndpointId: null,
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
  held: false,
  elsewhereCall: null,
};

/** `call()`'s callee (user-b) is the account these tests are signed in as unless said otherwise. */
function signInAs(id: string): void {
  useSessionStore.setState({ user: { id } as never });
}

beforeEach(() => {
  useCallStore.setState(RESET_STATE);
  useToastStore.setState({ toasts: [] });
  signInAs("user-b");
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

  describe("answered on another device", () => {
    it("a ringing tab goes idle with a toast and a plate when the call turns active", () => {
      useCallStore.getState().receiveIncoming(call());
      useCallStore
        .getState()
        .updateCall(call({ status: "active", answeredAt: "2026-01-01T00:00:00.000Z" }));

      const state = useCallStore.getState();
      expect(state.phase).toBe("idle");
      expect(state.call).toBeNull();
      expect(state.elsewhereCall?.status).toBe("active");
      expect(useToastStore.getState().toasts[0]?.message).toBe(
        "Звонок принят на другом устройстве",
      );
    });

    it("the tab that answered (connecting) is untouched by the same update", () => {
      useCallStore.getState().receiveIncoming(call());
      useCallStore.getState().beginConnecting();
      useCallStore.getState().updateCall(call({ status: "active" }));

      expect(useCallStore.getState().phase).toBe("connecting");
      expect(useCallStore.getState().elsewhereCall).toBeNull();
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("the calling tab is not touched when its own call becomes active", () => {
      signInAs("user-a");
      useCallStore.getState().startDraft("chat-1", false);
      useCallStore
        .getState()
        .applyOutgoingJoin({ call: call(), livekitUrl: "wss://lk", token: "t" });
      useCallStore.getState().updateCall(call({ status: "active" }));

      expect(useCallStore.getState().phase).toBe("connecting");
      expect(useCallStore.getState().elsewhereCall).toBeNull();
    });
  });

  describe("elsewhereCall", () => {
    it("applyActiveCall with no token for an active call never joins, it only records it", () => {
      useCallStore
        .getState()
        .applyActiveCall({ call: call({ status: "active" }), livekitUrl: "wss://lk", token: null });

      const state = useCallStore.getState();
      expect(state.phase).toBe("idle");
      expect(state.token).toBeNull();
      expect(state.elsewhereCall?.id).toBe("call-a");
    });

    it("applyActiveCall with no token for a ringing call the caller owns elsewhere records it", () => {
      signInAs("user-a");
      useCallStore
        .getState()
        .applyActiveCall({ call: call(), livekitUrl: "wss://lk", token: null });
      expect(useCallStore.getState().elsewhereCall?.id).toBe("call-a");
      expect(useCallStore.getState().phase).toBe("idle");
    });

    it("an untracked active call update sets it, and a final status clears it", () => {
      useCallStore.getState().updateCall(call({ status: "active" }));
      expect(useCallStore.getState().elsewhereCall?.id).toBe("call-a");

      useCallStore.getState().updateCall(call({ status: "ended" }));
      expect(useCallStore.getState().elsewhereCall).toBeNull();
    });

    it("a call of another account is never recorded", () => {
      signInAs("someone-else");
      useCallStore.getState().updateCall(call({ status: "active" }));
      expect(useCallStore.getState().elsewhereCall).toBeNull();
    });

    it("an untracked update is ignored while this tab has a call of its own", () => {
      useCallStore.getState().receiveIncoming(call({ id: "call-b" }));
      useCallStore.getState().updateCall(call({ id: "call-a", status: "active" }));
      expect(useCallStore.getState().elsewhereCall).toBeNull();
    });

    it("selectCallBusy covers both a local call and an elsewhere one", () => {
      expect(selectCallBusy(useCallStore.getState())).toBe(false);
      useCallStore.setState({ elsewhereCall: call({ status: "active" }) });
      expect(selectCallBusy(useCallStore.getState())).toBe(true);
      useCallStore.setState({ elsewhereCall: null, phase: "outgoing" });
      expect(selectCallBusy(useCallStore.getState())).toBe(true);
    });

    it("reset keeps it, so the end-of-call screen timing out does not hide a call elsewhere", () => {
      useCallStore.setState({ elsewhereCall: call({ status: "active" }) });
      useCallStore.getState().reset();
      expect(useCallStore.getState().elsewhereCall).not.toBeNull();
    });
  });

  describe("ending a call drops the media at once", () => {
    it("endLocally clears the LiveKit credentials", () => {
      useCallStore.setState({ phase: "active", call: call(), livekitUrl: "wss://lk", token: "t" });
      useCallStore.getState().endLocally("ended");
      expect(useCallStore.getState().token).toBeNull();
      expect(useCallStore.getState().livekitUrl).toBeNull();
    });

    it("a final status from the server clears them too, keeping the call for the summary", () => {
      useCallStore.setState({ phase: "active", call: call(), livekitUrl: "wss://lk", token: "t" });
      useCallStore.getState().updateCall(call({ status: "ended" }));
      const state = useCallStore.getState();
      expect(state.token).toBeNull();
      expect(state.livekitUrl).toBeNull();
      expect(state.call?.id).toBe("call-a");
    });
  });

  describe("setReconnected", () => {
    it("returns a reconnecting call with a joined peer to active", () => {
      useCallStore.setState({
        phase: "reconnecting",
        call: call({ status: "active" }),
        remoteJoined: true,
      });
      useCallStore.getState().setReconnected();
      expect(useCallStore.getState().phase).toBe("active");
    });

    it("leaves any other phase alone", () => {
      useCallStore.setState({
        phase: "connecting",
        call: call({ status: "active" }),
        remoteJoined: true,
      });
      useCallStore.getState().setReconnected();
      expect(useCallStore.getState().phase).toBe("connecting");
    });
  });

  describe("a late accept response", () => {
    it("is ignored once the call ended locally", () => {
      useCallStore.setState({
        phase: "ended",
        call: call({ status: "active" }),
        endReason: "ended",
      });
      useCallStore
        .getState()
        .applyJoin({ call: call({ status: "active" }), livekitUrl: "wss://lk", token: "t" });
      expect(useCallStore.getState().token).toBeNull();
    });

    it("is ignored when it belongs to another call", () => {
      useCallStore.setState({ phase: "connecting", call: call({ id: "call-b" }) });
      useCallStore
        .getState()
        .applyJoin({ call: call({ status: "active" }), livekitUrl: "wss://lk", token: "t" });
      expect(useCallStore.getState().token).toBeNull();
      expect(useCallStore.getState().call?.id).toBe("call-b");
    });
  });

  describe("reconcileActiveCall (socket reconnect re-sync)", () => {
    it("drops a tracked call the server has replaced by another live one", () => {
      useCallStore.setState({
        phase: "active",
        call: call({ id: "call-old", status: "active" }),
        token: "t",
      });
      useCallStore.getState().reconcileActiveCall({
        call: call({ id: "call-new" }),
        livekitUrl: "wss://lk",
        token: null,
      });
      expect(useCallStore.getState().phase).toBe("incoming");
      expect(useCallStore.getState().call?.id).toBe("call-new");
      expect(useCallStore.getState().token).toBeNull();
    });

    it("ends a tracked call locally when the server knows none", () => {
      useCallStore.setState({
        phase: "active",
        call: call({ status: "active" }),
        token: "t",
      });
      useCallStore.getState().reconcileActiveCall(null);
      expect(useCallStore.getState().phase).toBe("ended");
      expect(useCallStore.getState().token).toBeNull();
    });

    it("silently stops a ringing incoming call the server no longer knows", () => {
      useCallStore.getState().receiveIncoming(call());
      useCallStore.getState().reconcileActiveCall(null);
      expect(useCallStore.getState().phase).toBe("idle");
    });

    it("does not end a draft whose POST /calls is still in flight", () => {
      useCallStore.getState().startDraft("chat-1", false);
      useCallStore.getState().reconcileActiveCall(null);
      expect(useCallStore.getState().phase).toBe("outgoing");
    });

    it("clears a stale elsewhere plate", () => {
      useCallStore.setState({ elsewhereCall: call({ status: "active" }) });
      useCallStore.getState().reconcileActiveCall(null);
      expect(useCallStore.getState().elsewhereCall).toBeNull();
    });

    it("picks up a status change missed while offline for the tracked call", () => {
      useCallStore.getState().receiveIncoming(call());
      useCallStore.getState().reconcileActiveCall({
        call: call({ status: "active" }),
        livekitUrl: "wss://lk",
        token: null,
      });
      expect(useCallStore.getState().phase).toBe("idle");
      expect(useCallStore.getState().elsewhereCall?.status).toBe("active");
    });
  });

  it("setHeld marks the call as held, and reset clears it", () => {
    useCallStore.getState().setHeld(true);
    expect(useCallStore.getState().held).toBe(true);
    useCallStore.getState().reset();
    expect(useCallStore.getState().held).toBe(false);
  });

  it("a fresh draft or incoming call starts not held", () => {
    useCallStore.getState().setHeld(true);
    useCallStore.getState().startDraft("chat-1", false);
    expect(useCallStore.getState().held).toBe(false);
  });

  it("reset clears everything back to idle", () => {
    useCallStore.getState().startDraft("chat-1", true);
    useCallStore.getState().minimize();
    useCallStore.getState().reset();
    expect(useCallStore.getState()).toMatchObject(RESET_STATE);
  });
});
