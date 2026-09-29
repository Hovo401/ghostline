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
});
export type Call = z.infer<typeof CallSchema>;

/** `POST /calls` body. */
export const StartCallBodySchema = z.object({
  chatId: z.string().uuid(),
  video: z.boolean(),
});
export type StartCallBody = z.infer<typeof StartCallBodySchema>;

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
 * re-show the incoming-call screen after a reload).
 */
export const ActiveCallSchema = z.object({
  call: CallSchema,
  livekitUrl: z.string().url(),
  token: z.string().min(1).nullable(),
});
export type ActiveCall = z.infer<typeof ActiveCallSchema>;
