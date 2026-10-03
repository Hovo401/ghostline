import { createHmac, timingSafeEqual } from "node:crypto";

import type { Call, CallStatus, PushCallIncomingPayload } from "@ghostline/contracts";
import type { Call as PrismaCall, CallStatus as PrismaCallStatus } from "@prisma/client";

/**
 * Pure helpers shared by `CallsService` (HTTP app), `NotificationsService`
 * (signs the decline token embedded in a `call:incoming` push) and the
 * worker's ring-timeout processor (`jobs/calls.processor.ts`) — none of
 * these should reach into `CallsModule` for a plain mapping/signing
 * function, same rationale as `messages/message.util.ts`.
 */

const PRISMA_TO_WIRE_STATUS: Record<PrismaCallStatus, CallStatus> = {
  RINGING: "ringing",
  ACTIVE: "active",
  ENDED: "ended",
  MISSED: "missed",
  DECLINED: "declined",
  CANCELLED: "cancelled",
  BUSY: "busy",
  FAILED: "failed",
};

export function toWireCall(call: PrismaCall): Call {
  return {
    id: call.id,
    chatId: call.chatId,
    callerId: call.callerId,
    calleeId: call.calleeId,
    video: call.video,
    status: PRISMA_TO_WIRE_STATUS[call.status],
    createdAt: call.createdAt.toISOString(),
    answeredAt: call.answeredAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
  };
}

/** LiveKit room name for a call — deterministic from the call id, never reused across calls. */
export function roomNameForCall(callId: string): string {
  return `call:${callId}`;
}

/** `call:busy:<userId>` Redis lock key (docs/adr/0009's busy/glare handling). */
export function busyLockKey(userId: string): string {
  return `call:busy:${userId}`;
}

/**
 * HMAC-signed, one-purpose token that lets a push notification's "Decline"
 * action (no access token available — the service worker fired it, not a
 * logged-in tab) reject a call. Signs only the call id, under the same
 * secret as access tokens (`JWT_ACCESS_SECRET`) — a dedicated secret would
 * be more isolated but isn't warranted for a token that only ever
 * authorizes "decline this one already-identified call".
 */
export function signDeclineToken(secret: string, callId: string): string {
  return createHmac("sha256", secret).update(callId).digest("base64url");
}

/**
 * The `call:incoming` push, built in one place for both its first send
 * (`NotificationsService.notifyCallIncoming`) and the worker's ring repeats.
 */
export function callIncomingPush(
  call: Call,
  callerName: string,
  callerAvatarUrl: string | null,
  secret: string,
): PushCallIncomingPayload {
  return {
    kind: "call:incoming",
    call,
    callerName,
    callerAvatarUrl,
    declineToken: signDeclineToken(secret, call.id),
  };
}

export function verifyDeclineToken(secret: string, callId: string, token: string): boolean {
  const expected = Buffer.from(signDeclineToken(secret, callId));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
