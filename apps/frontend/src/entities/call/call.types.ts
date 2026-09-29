import type { ActiveCall, Call, CallJoin, CallStatus, StartCallBody } from "@ghostline/contracts";

export type { ActiveCall, Call, CallJoin, CallStatus, StartCallBody };

/**
 * Client-only call UI phase — never on the wire (that's `Call.status`, see
 * `@ghostline/contracts`' `call.schema.ts`). Tracks *this device's* view of
 * the call, which needs a couple of states `CallStatus` doesn't: "outgoing"
 * (this device started it, still `ringing` server-side) vs. "incoming" (the
 * other party started it), and "connecting" (LiveKit join credentials are in
 * hand but the remote participant hasn't actually joined the `Room` yet —
 * see `call-store.ts`'s `remoteJoined`).
 */
export type CallPhase =
  "idle" | "outgoing" | "incoming" | "connecting" | "active" | "reconnecting" | "ended";

/**
 * Why a call ended, for `CallEnded`'s summary screen — a superset of
 * `CallStatus`'s terminal values plus purely client-side outcomes
 * (`rate_limited`/`unavailable`/`forbidden`) that never make it into a
 * `Call` object because the `POST /calls` request that would have created
 * one failed outright.
 */
export type CallEndReason =
  | "ended"
  | "cancelled"
  | "declined"
  | "busy"
  | "missed"
  | "failed"
  | "rate_limited"
  | "unavailable"
  | "forbidden"
  /** The call was accepted server-side but media never came up within
   * `CONNECT_TIMEOUT_MS` (`use-call-session.ts`) — distinct from
   * `"unavailable"` (the `POST /calls` request itself failing) so
   * `CallEnded` can tell the two apart. */
  | "connect_failed";
