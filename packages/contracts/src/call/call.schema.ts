import { z } from "zod";

/**
 * 1:1 audio/video calls, signalled over REST (ADR-0002) and delivered to the
 * callee over WS (`call:incoming` / `call:updated`, see `ws/events.schema.ts`).
 * Media itself runs on a self-hosted LiveKit SFU — this schema only carries
 * the call's lifecycle state and the join credentials, never media.
 */

export const CallStatusSchema = z.enum([
  "ringing",
  "active",
  "ended",
  "missed",
  "declined",
  "cancelled",
  "busy",
  "failed",
]);
export type CallStatus = z.infer<typeof CallStatusSchema>;

export const CallSchema = z.object({
  id: z.string().uuid(),
  chatId: z.string().uuid(),
  callerId: z.string().uuid(),
  calleeId: z.string().uuid(),
  video: z.boolean(),
  status: CallStatusSchema,
  createdAt: z.string().datetime(),
  answeredAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable(),
  /**
   * The one tab/device per side that holds the call's media (ADR-0023). Set
   * by `POST /calls` (caller) and on the answer (callee); every other
   * device of the same account only watches. `null` until that side has one.
   */
  callerEndpointId: z.string().uuid().nullable(),
  calleeEndpointId: z.string().uuid().nullable(),
});
export type Call = z.infer<typeof CallSchema>;

/**
 * Message of the `409` that `accept`/`token` answer with when another device of
 * the same account owns this side of the call (ADR-0023). Shared so the client
 * can tell it from a plain "call is gone" conflict.
 */
export const ANSWERED_ELSEWHERE_ERROR = "answered_elsewhere";

/**
 * A random id one browser tab / WebView generates per page load. The session
 * id (`sid`) can't tell two tabs of one browser apart, so the media owner of a
 * call is an endpoint, not a session.
 */
export const EndpointIdSchema = z.string().uuid();

/** `POST /calls` body. */
export const StartCallBodySchema = z.object({
  chatId: z.string().uuid(),
  video: z.boolean(),
  endpointId: EndpointIdSchema,
});
export type StartCallBody = z.infer<typeof StartCallBodySchema>;

/** `POST /calls/:id/accept` and `POST /calls/:id/token` body. */
export const CallEndpointBodySchema = z.object({ endpointId: EndpointIdSchema });
export type CallEndpointBody = z.infer<typeof CallEndpointBodySchema>;

/** `GET /calls/active` query. */
export const ActiveCallQuerySchema = z.object({ endpointId: EndpointIdSchema });
export type ActiveCallQuery = z.infer<typeof ActiveCallQuerySchema>;

/**
 * Response of `POST /calls/:id/accept` and `POST /calls/:id/token` — the
 * call's current state plus this caller's join credentials for the LiveKit
 * room. Re-requestable any time the call is active (reconnect, page reload).
 */
export const CallJoinSchema = z.object({
  call: CallSchema,
  livekitUrl: z.string().url(),
  token: z.string().min(1),
});
export type CallJoin = z.infer<typeof CallJoinSchema>;

/**
 * Response of `GET /calls/active` — like `CallJoin`, but `token` is
 * nullable: a still-`RINGING` call where the requester is the callee (they
 * haven't answered yet, so they get no LiveKit credentials, just enough to
 * re-show the incoming-call screen after a reload) — and a call whose media
 * lives on another device of the same account (ADR-0023): the requester only
 * learns it exists.
 */
export const ActiveCallSchema = z.object({
  call: CallSchema,
  livekitUrl: z.string().url(),
  token: z.string().min(1).nullable(),
});
export type ActiveCall = z.infer<typeof ActiveCallSchema>;
