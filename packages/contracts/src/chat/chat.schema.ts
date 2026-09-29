import { z } from "zod";

import { MessageSchema } from "../message/message.schema";

/** Chat list item (as returned by `GET /chats`) and open-direct request. */

export const ChatTypeSchema = z.enum(["DIRECT", "SAVED"]);
export type ChatType = z.infer<typeof ChatTypeSchema>;

export const ChatListItemSchema = z.object({
  id: z.string().uuid(),
  type: ChatTypeSchema,
  peer: z
    .object({
      id: z.string().uuid(),
      username: z.string(),
      displayName: z.string(),
      avatarKey: z.string().nullable(),
      avatarUrl: z.string().url().nullable(),
      online: z.boolean(),
    })
    .nullable(),
  lastMessage: MessageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  muted: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type ChatListItem = z.infer<typeof ChatListItemSchema>;

export const OpenDirectRequestSchema = z.object({
  userId: z.string().uuid(),
});
export type OpenDirectRequest = z.infer<typeof OpenDirectRequestSchema>;

export const MuteChatRequestSchema = z.object({
  muted: z.boolean(),
});
export type MuteChatRequest = z.infer<typeof MuteChatRequestSchema>;

/** `POST /chats/:id/read` body. Omit `upToSeq` to mark the whole chat read. */
export const MarkReadRequestSchema = z.object({
  upToSeq: z.coerce.bigint().optional(),
});
export type MarkReadRequest = z.infer<typeof MarkReadRequestSchema>;
