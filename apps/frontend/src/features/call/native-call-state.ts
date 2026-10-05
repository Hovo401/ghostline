import type { Call, CallPhase } from "../../entities/call";
import type { NativeCallState } from "../../shared/native";

import { FALLBACK_PEER_NAME } from "./use-call-peer";

export interface NativeCallStateInput {
  phase: CallPhase;
  call: Call | null;
  peerName: string | null;
  /** Only reported with an incoming call, for the native notification's avatar. */
  peerAvatarUrl?: string | null;
  micEnabled: boolean;
}

/**
 * The call as the phone's notification/Telecom layer needs to see it, or `null` when there is nothing
 * to report: no call (`idle`), or an outgoing draft that has no call id yet (`POST /calls` still in flight).
 */
export function buildNativeCallState(input: NativeCallStateInput): NativeCallState | null {
  const { phase, call, peerName, peerAvatarUrl, micEnabled } = input;
  if (phase === "idle" || !call) return null;
  const answeredAt = call.answeredAt ? Date.parse(call.answeredAt) : Number.NaN;
  return {
    callId: call.id,
    chatId: call.chatId,
    phase,
    video: call.video,
    peerName: peerName ?? FALLBACK_PEER_NAME,
    answeredAt: Number.isNaN(answeredAt) ? null : answeredAt,
    muted: !micEnabled,
    // An incoming call is also started natively from this state when its push never came or was
    // dropped (T-094): native needs the server's `createdAt` to ring only the time that is left.
    ...(phase === "incoming"
      ? { createdAt: call.createdAt, callerAvatarUrl: peerAvatarUrl ?? null }
      : {}),
  };
}

export function isSameNativeCallState(
  a: NativeCallState | null,
  b: NativeCallState | null,
): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.callId === b.callId &&
    a.chatId === b.chatId &&
    a.phase === b.phase &&
    a.video === b.video &&
    a.peerName === b.peerName &&
    a.answeredAt === b.answeredAt &&
    a.muted === b.muted &&
    a.createdAt === b.createdAt &&
    a.callerAvatarUrl === b.callerAvatarUrl
  );
}
