import { create } from "zustand";

import type { ActiveCall, Call, CallEndReason, CallJoin, CallPhase } from "./call.types";

/** `Call.status` values that mean the call is over — mapped straight to a
 * `CallEndReason` for `CallEnded`'s copy. `"active"`/`"ringing"` are the only
 * two non-final statuses. */
const FINAL_STATUS_REASONS: Partial<Record<Call["status"], CallEndReason>> = {
  ended: "ended",
  missed: "missed",
  declined: "declined",
  cancelled: "cancelled",
  busy: "busy",
  failed: "failed",
};

/** This device wants to place a call but `POST /calls` hasn't resolved yet
 * — `startDraft` sets this so the outgoing-call UI can show "Calling…"
 * before any `Call` object exists at all. */
interface CallDraft {
  chatId: string;
  video: boolean;
}

interface CallState {
  phase: CallPhase;
  call: Call | null;
  livekitUrl: string | null;
  token: string | null;
  minimized: boolean;
  /** Whether *this device* wants its camera on once it joins the LiveKit
   * room — always reset to `true` for a fresh call, but `IncomingCall`'s
   * "Ответить аудио" flips it to `false` before accepting a video call, so
   * the callee can join camera-off even though the call itself is a video
   * call (`Call.video`). Gated by `Call.video` either way: it never turns
   * a genuinely audio-only call into a video one. */
  localVideoIntent: boolean;
  /** Set while `start()`'s request is in flight, cleared once the server
   * responds (successfully or not) — see `CallDraft`. */
  draft: CallDraft | null;
  /** Set alongside `phase: "ended"` — `CallEnded` reads this for its copy. */
  endReason: CallEndReason | null;
  /** True once LiveKit reports the remote participant is actually in the
   * room (`useCallSession`) — `phase` only becomes `"active"` once this is
   * true *and* the server says the call is active, never from the LiveKit
   * connection state alone (that's just "I reached the SFU", not "the other
   * person is here"). */
  remoteJoined: boolean;
  /** The phone put this call on hold (a GSM call came in, T-087) — the mic is off and the peer is
   * muted until native sends `resume`. Never set by the web UI itself. */
  held: boolean;

  setLocalVideoIntent: (enabled: boolean) => void;
  /** This device is about to place a call — before any network round trip. */
  startDraft: (chatId: string, video: boolean) => void;
  /** `POST /calls` resolved with join credentials — no-ops if this device
   * has already moved on (e.g. the user cancelled before the response
   * arrived, or a fresher draft/incoming call replaced this one). */
  applyOutgoingJoin: (join: CallJoin) => void;
  /** `call:incoming` arrived for this device (it's the callee). Ignored if
   * this tab is already mid-call on a *different* call — a second ring
   * belongs to another tab/device, not this one. */
  receiveIncoming: (call: Call) => void;
  /** The callee tapped answer — moves to "connecting" immediately, before
   * `POST /calls/:id/accept` resolves (accepting doesn't end the call, so
   * this is not `endLocally`). */
  beginConnecting: () => void;
  /** LiveKit join credentials arrived (`accept` response, or
   * `applyActiveCall` on reload). */
  applyJoin: (join: CallJoin) => void;
  /** `call:updated` — any status change of the call this device is
   * currently tracking. No-ops for a call this device isn't tracking. A
   * final status ends the call locally with the matching reason; `"active"`
   * only flips `phase` to `"active"` once `remoteJoined` is also true. */
  updateCall: (call: Call) => void;
  /** `useCallSession` observed the remote participant actually join the
   * LiveKit room. */
  setRemoteJoined: () => void;
  setReconnecting: () => void;
  /** `GET /calls/active` resumed a call across a reload — only applied
   * while `phase === "idle"`, so it never clobbers a call already in
   * progress in this tab. */
  applyActiveCall: (active: ActiveCall) => void;
  /** Every user-initiated end action (hangup/cancel/decline click, or a
   * mutation error) calls this FIRST, synchronously — the UI must never
   * wait on a network round trip to stop ringing/stop the call screen. */
  endLocally: (reason: CallEndReason) => void;
  setHeld: (held: boolean) => void;
  minimize: () => void;
  restore: () => void;
  reset: () => void;
}

const IDLE_STATE = {
  phase: "idle" as const,
  call: null as Call | null,
  livekitUrl: null as string | null,
  token: null as string | null,
  minimized: false,
  localVideoIntent: true,
  draft: null as CallDraft | null,
  endReason: null as CallEndReason | null,
  remoteJoined: false,
  held: false,
};

export const useCallStore = create<CallState>((set, get) => ({
  ...IDLE_STATE,

  setLocalVideoIntent: (enabled) => {
    set({ localVideoIntent: enabled });
  },

  startDraft: (chatId, video) => {
    set({ ...IDLE_STATE, phase: "outgoing", draft: { chatId, video } });
  },

  applyOutgoingJoin: (join) => {
    if (get().phase !== "outgoing") return;
    set({ call: join.call, livekitUrl: join.livekitUrl, token: join.token, draft: null });
  },

  receiveIncoming: (call) => {
    const { call: current, phase } = get();
    const busyWithAnotherCall = current !== null && current.id !== call.id && phase !== "ended";
    if (busyWithAnotherCall) return;
    set({ ...IDLE_STATE, phase: "incoming", call });
  },

  beginConnecting: () => {
    set({ phase: "connecting" });
  },

  applyJoin: ({ call, livekitUrl, token }) => {
    set({ call, livekitUrl, token });
  },

  updateCall: (call) => {
    const current = get().call;
    if (current?.id !== call.id) return;

    const endReason = FINAL_STATUS_REASONS[call.status];
    if (endReason) {
      set({ call, phase: "ended", endReason });
      return;
    }

    set((state) => {
      const stillConnecting =
        state.phase === "outgoing" ||
        state.phase === "connecting" ||
        state.phase === "reconnecting";
      const phase: CallPhase =
        call.status === "active" && stillConnecting
          ? state.remoteJoined
            ? "active"
            : "connecting"
          : state.phase;
      return { call, phase };
    });
  },

  setRemoteJoined: () => {
    set((state) => ({
      remoteJoined: true,
      phase: state.call?.status === "active" ? "active" : state.phase,
    }));
  },

  setReconnecting: () => {
    set({ phase: "reconnecting" });
  },

  applyActiveCall: ({ call, livekitUrl, token }) => {
    if (get().phase !== "idle") return;
    if (token === null) {
      // Still-ringing call where we're the callee — re-show incoming, no
      // LiveKit credentials to connect with yet.
      set({ ...IDLE_STATE, phase: "incoming", call });
      return;
    }
    set({
      ...IDLE_STATE,
      phase: call.status === "ringing" ? "outgoing" : "connecting",
      call,
      livekitUrl,
      token,
    });
  },

  endLocally: (reason) => {
    set({ phase: "ended", endReason: reason });
  },

  setHeld: (held) => {
    set({ held });
  },

  minimize: () => {
    set({ minimized: true });
  },

  restore: () => {
    set({ minimized: false });
  },

  reset: () => {
    set({ ...IDLE_STATE });
  },
}));
