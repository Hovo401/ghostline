import { create } from "zustand";

import { useSessionStore } from "../../shared/api/session-store";
import { useToastStore } from "../../shared/ui/toast-store";

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

function currentUserId(): string | null {
  return useSessionStore.getState().user?.id ?? null;
}

/** Whether `call` is a live call of this account whose media this tab does not hold — started or
 * answered on another device (ADR-0023). A ringing call counts only for the caller's other
 * devices: for the callee every device rings, so it is an incoming call, not an "elsewhere" one. */
function livesElsewhere(call: Call, userId: string | null): boolean {
  if (userId === null) return false;
  if (call.status === "active") return call.callerId === userId || call.calleeId === userId;
  return call.status === "ringing" && call.callerId === userId;
}

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
  /** A live call of this account whose media another device/tab holds (ADR-0023): shown as a
   * plate and it disables this tab's call buttons. Tab-level, not call-level — `reset()` leaves
   * it alone — and only ever set while this tab has no call of its own. */
  elsewhereCall: Call | null;

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
  /** `call:updated` — any status change of a call of this account. For the call this device
   * tracks: a final status ends it locally with the matching reason, `"active"` only flips
   * `phase` to `"active"` once `remoteJoined` is also true, and `"active"` while still ringing
   * here means another device answered. For a call it doesn't track it maintains
   * `elsewhereCall`. */
  updateCall: (call: Call) => void;
  /** This device lost the race for the call: another one answered it (`call:updated` while
   * ringing here, or `accept` answered 409 `answered_elsewhere`). Goes idle quietly with a toast
   * and shows the call as `elsewhereCall`. */
  answeredElsewhere: (call: Call | null) => void;
  /** Drops `elsewhereCall` (logout). */
  clearElsewhere: () => void;
  /** Reconciles with `GET /calls/active` after a socket reconnect, to catch what the socket
   * missed while down. `null` means the server knows no live call, so whatever this tab was
   * tracking is over. */
  reconcileActiveCall: (active: ActiveCall | null) => void;
  /** `useCallSession` observed the remote participant actually join the
   * LiveKit room. */
  setRemoteJoined: () => void;
  setReconnecting: () => void;
  /** The LiveKit room recovered after a drop — back to the phase the call had before it. */
  setReconnected: () => void;
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

/** True while this tab can't start another call: it has one of its own (any phase, the
 * end-of-call screen included) or its account's call runs on another device. */
export function selectCallBusy(state: Pick<CallState, "phase" | "elsewhereCall">): boolean {
  return state.phase !== "idle" || state.elsewhereCall !== null;
}

export const useCallStore = create<CallState>((set, get) => ({
  ...IDLE_STATE,
  elsewhereCall: null,

  setLocalVideoIntent: (enabled) => {
    set({ localVideoIntent: enabled });
  },

  startDraft: (chatId, video) => {
    set({ ...IDLE_STATE, phase: "outgoing", draft: { chatId, video }, elsewhereCall: null });
  },

  applyOutgoingJoin: (join) => {
    if (get().phase !== "outgoing") return;
    set({ call: join.call, livekitUrl: join.livekitUrl, token: join.token, draft: null });
  },

  receiveIncoming: (call) => {
    const { call: current, phase } = get();
    if (call.callerId === currentUserId()) {
      // Our own outgoing call, started on another device.
      if (phase === "idle") set({ elsewhereCall: call });
      return;
    }
    const busyWithAnotherCall = current !== null && current.id !== call.id && phase !== "ended";
    if (busyWithAnotherCall) return;
    set({ ...IDLE_STATE, phase: "incoming", call, elsewhereCall: null });
  },

  beginConnecting: () => {
    set({ phase: "connecting" });
  },

  applyJoin: ({ call, livekitUrl, token }) => {
    // A slow `accept` response can land after the user already hung up (or the next call began):
    // writing its token back would reconnect a room nobody shows.
    const state = get();
    if (state.phase !== "connecting" || state.call?.id !== call.id) return;
    set({ call, livekitUrl, token });
  },

  updateCall: (call) => {
    const { call: current, phase, elsewhereCall } = get();
    const endReason = FINAL_STATUS_REASONS[call.status];

    if (current?.id !== call.id) {
      if (elsewhereCall?.id === call.id) {
        const stillElsewhere = !endReason && livesElsewhere(call, currentUserId());
        set({ elsewhereCall: stillElsewhere ? call : null });
      } else if (phase === "idle" && livesElsewhere(call, currentUserId())) {
        set({ elsewhereCall: call });
      }
      return;
    }

    if (endReason) {
      // Token and URL go with the call so `useCallSession` drops the room at once instead of
      // when `CallEnded` resets the store.
      set({ call, phase: "ended", endReason, token: null, livekitUrl: null });
      return;
    }

    if (phase === "incoming" && call.status === "active") {
      // Answered by another device while this one was still ringing. The answering device is
      // already in "connecting" here, so it never lands in this branch.
      get().answeredElsewhere(call);
      return;
    }

    set((state) => {
      const stillConnecting =
        state.phase === "outgoing" ||
        state.phase === "connecting" ||
        state.phase === "reconnecting";
      const nextPhase: CallPhase =
        call.status === "active" && stillConnecting
          ? state.remoteJoined
            ? "active"
            : "connecting"
          : state.phase;
      return { call, phase: nextPhase };
    });
  },

  answeredElsewhere: (call) => {
    useToastStore
      .getState()
      .push({ variant: "info", message: "Звонок принят на другом устройстве" });
    set({
      ...IDLE_STATE,
      elsewhereCall: call ? { ...call, status: "active" } : null,
    });
  },

  clearElsewhere: () => {
    set({ elsewhereCall: null });
  },

  reconcileActiveCall: (active) => {
    const { call, phase, elsewhereCall } = get();
    if (active === null) {
      if (elsewhereCall) set({ elsewhereCall: null });
      if (call && phase !== "idle" && phase !== "ended") {
        if (phase === "incoming") set({ ...IDLE_STATE });
        else get().endLocally("ended");
      }
      return;
    }
    if (call?.id === active.call.id || elsewhereCall?.id === active.call.id) {
      get().updateCall(active.call);
      return;
    }
    // The server's live call isn't the one this tab tracks: ours is over there, so don't let it block the live one.
    if (call && phase !== "idle") set({ ...IDLE_STATE });
    get().applyActiveCall(active);
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

  setReconnected: () => {
    set((state) => {
      if (state.phase !== "reconnecting") return state;
      const recovered = state.call?.status === "active" && state.remoteJoined;
      return { phase: recovered ? "active" : "connecting" };
    });
  },

  applyActiveCall: ({ call, livekitUrl, token }) => {
    if (get().phase !== "idle") return;
    if (token === null) {
      const userId = currentUserId();
      if (call.status === "ringing" && call.calleeId === userId) {
        // Still-ringing call where we're the callee — re-show incoming, no
        // LiveKit credentials to connect with yet.
        set({ ...IDLE_STATE, phase: "incoming", call, elsewhereCall: null });
      } else if (livesElsewhere(call, userId)) {
        // The media lives on another device of this account: never join it, just show the plate.
        set({ elsewhereCall: call });
      }
      return;
    }
    set({
      ...IDLE_STATE,
      elsewhereCall: null,
      phase: call.status === "ringing" ? "outgoing" : "connecting",
      call,
      livekitUrl,
      token,
    });
  },

  endLocally: (reason) => {
    // Token and URL are cleared so `useCallSession` drops the room (mic, remote audio) right now.
    set({ phase: "ended", endReason: reason, token: null, livekitUrl: null });
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
