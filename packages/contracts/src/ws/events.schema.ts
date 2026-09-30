import { z } from "zod";

import type { Call } from "../call/call.schema";
import type { ChatListItem } from "../chat/chat.schema";
import type { Message } from "../message/message.schema";
import type { UserPublicProfile } from "../user/user.schema";

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

export const deliveredUpdatedPayloadSchema = z.object({
  chatId: z.string().uuid(),
  userId: z.string().uuid(),
  lastDeliveredSeq: z.coerce.bigint(),
});
export type DeliveredUpdatedPayload = z.infer<typeof deliveredUpdatedPayloadSchema>;

export const chatRemovedPayloadSchema = z.object({
  chatId: z.string().uuid(),
});
export type ChatRemovedPayload = z.infer<typeof chatRemovedPayloadSchema>;

export const messageDeletedPayloadSchema = z.object({
  chatId: z.string().uuid(),
  messageId: z.string().uuid(),
});
export type MessageDeletedPayload = z.infer<typeof messageDeletedPayloadSchema>;

export interface ServerToClientEvents {
  "message:new": (payload: Message) => void;
  "message:updated": (payload: Message) => void;
  "message:deleted": (payload: MessageDeletedPayload) => void;
  "chat:updated": (payload: ChatListItem) => void;
  "chat:removed": (payload: ChatRemovedPayload) => void;
  "read:updated": (payload: ReadUpdatedPayload) => void;
  "delivered:updated": (payload: DeliveredUpdatedPayload) => void;
  "user:updated": (payload: UserPublicProfile) => void;
  presence: (payload: PresencePayload) => void;
  typing: (payload: TypingServerPayload) => void;
  // Sent to every socket in `user:${calleeId}` (all tabs/devices) so a tab
  // that isn't handling the call learns it was answered/declined/ended
  // elsewhere and stops ringing. Also sent to the caller on status changes.
  "call:incoming": (payload: Call) => void;
  "call:updated": (payload: Call) => void;
}

export interface ClientToServerEvents {
  typing: (payload: TypingClientPayload) => void;
}
