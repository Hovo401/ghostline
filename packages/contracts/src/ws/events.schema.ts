import { z } from "zod";

/**
 * Realtime protocol (Socket.IO), per REQUIREMENTS.md §7.5.
 *
 * Backend's `realtime` gateway and the frontend's socket client both import
 * `ServerToClientEvents` / `ClientToServerEvents` from here — this is the one
 * place the wire protocol is defined. Adding an event means adding it here
 * first, not inline in a handler.
 */

const typingActionSchema = z.enum(["typing", "voice", "video"]);
export type TypingAction = z.infer<typeof typingActionSchema>;

export const typingClientPayloadSchema = z.object({
  chatId: z.string().uuid(),
  action: typingActionSchema,
});
export type TypingClientPayload = z.infer<typeof typingClientPayloadSchema>;

export const typingServerPayloadSchema = typingClientPayloadSchema.extend({
  userId: z.string().uuid(),
});
export type TypingServerPayload = z.infer<typeof typingServerPayloadSchema>;

export const presencePayloadSchema = z.object({
  userId: z.string().uuid(),
  online: z.boolean(),
  lastSeenAt: z.string().datetime().nullable(),
});
export type PresencePayload = z.infer<typeof presencePayloadSchema>;

export const readUpdatedPayloadSchema = z.object({
  chatId: z.string().uuid(),
  userId: z.string().uuid(),
  lastReadSeq: z.coerce.bigint(),
});
export type ReadUpdatedPayload = z.infer<typeof readUpdatedPayloadSchema>;

export const chatRemovedPayloadSchema = z.object({
  chatId: z.string().uuid(),
});
export type ChatRemovedPayload = z.infer<typeof chatRemovedPayloadSchema>;

export const messageDeletedPayloadSchema = z.object({
  chatId: z.string().uuid(),
  messageId: z.string().uuid(),
});
export type MessageDeletedPayload = z.infer<typeof messageDeletedPayloadSchema>;

/**
 * `message:new` / `message:updated` and `chat:updated` carry the full
 * resource. Those resource shapes belong to their own domain modules
 * (messages/chats) once implemented — placeholder `unknown` here on
 * purpose so this scaffold doesn't guess at a shape ahead of the schema.
 */
export interface ServerToClientEvents {
  "message:new": (payload: unknown) => void;
  "message:updated": (payload: unknown) => void;
  "message:deleted": (payload: MessageDeletedPayload) => void;
  "chat:updated": (payload: unknown) => void;
  "chat:removed": (payload: ChatRemovedPayload) => void;
  "read:updated": (payload: ReadUpdatedPayload) => void;
  presence: (payload: PresencePayload) => void;
  typing: (payload: TypingServerPayload) => void;
}

export interface ClientToServerEvents {
  typing: (payload: TypingClientPayload) => void;
}
