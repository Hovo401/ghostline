import { z } from "zod";

import { AttachmentSchema } from "../attachment/attachment.schema";

/** Message types, delivery status, send request and the wire resource shape. */

export const MessageTypeSchema = z.enum([
  "text",
  "image",
  "file",
  "voice",
  "video",
  "video_note",
  "call",
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

/** Present only on `type: "call"` messages — a call's outcome, for the history row in the feed. */
export const MessageCallInfoSchema = z.object({
  status: z.enum(["ended", "missed", "declined", "cancelled"]),
  video: z.boolean(),
  durationMs: z.number().int().min(0).nullable(),
});
export type MessageCallInfo = z.infer<typeof MessageCallInfoSchema>;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
// Emoji presentation (ZWJ sequences and skin tones are one grapheme), keycaps and flags.
// The `v`-flag `\p{RGI_Emoji}` isn't available at our ES2023 target.
const EMOJI_PATTERN =
  /\p{Extended_Pictographic}|^[#*0-9]\uFE0F?\u20E3$|^\p{Regional_Indicator}{2}$/u;

/** One emoji reaction — exactly one grapheme that is an emoji. */
export const ReactionEmojiSchema = z
  .string()
  .max(32)
  .refine((v) => [...graphemeSegmenter.segment(v)].length === 1 && EMOJI_PATTERN.test(v), {
    message: "reaction must be a single emoji",
  });
export type ReactionEmoji = z.infer<typeof ReactionEmojiSchema>;

/** `PUT /messages/:id/reaction` body. A user holds at most one reaction per message. */
export const SetReactionRequestSchema = z.object({ emoji: ReactionEmojiSchema });
export type SetReactionRequest = z.infer<typeof SetReactionRequestSchema>;

/** Reactions grouped by emoji, in order of the first reaction. `userIds` lets each client find "mine". */
export const MessageReactionSchema = z.object({
  emoji: z.string(),
  count: z.number().int().positive(),
  userIds: z.array(z.string().uuid()).min(1),
});
export type MessageReaction = z.infer<typeof MessageReactionSchema>;

export const MessageStatusSchema = z.enum(["sent", "delivered", "read"]);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const SendMessageRequestSchema = z
  .object({
    chatId: z.string().uuid(),
    clientMessageId: z.string().uuid(),
    type: MessageTypeSchema,
    text: z.string().max(4000).optional(),
    attachmentId: z.string().uuid().optional(),
    durationMs: z.number().int().positive().optional(),
    waveform: z.array(z.number().int().min(0).max(255)).optional(),
    replyToId: z.string().uuid().optional(),
  })
  .refine((v) => (v.type === "text" ? !!v.text : !!v.attachmentId), {
    message: "text messages need `text`, media messages need `attachmentId`",
  });
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

/** `PATCH /messages/:id` body — a text message's text or a photo/video/file caption. */
export const EditMessageRequestSchema = z.object({
  text: z.string().min(1).max(4000),
});
export type EditMessageRequest = z.infer<typeof EditMessageRequestSchema>;

/**
 * `GET /messages` query — `beforeSeq` pages older history (scroll-up),
 * `afterSeq` catches up on reconnect (REQUIREMENTS.md §7.5 / T-015). Passing
 * both is not meaningful; callers pick one direction per request.
 */
export const ListMessagesQuerySchema = z.object({
  chatId: z.string().uuid(),
  beforeSeq: z.coerce.bigint().optional(),
  afterSeq: z.coerce.bigint().optional(),
});
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  chatId: z.string().uuid(),
  seq: z.coerce.bigint(),
  senderId: z.string().uuid().nullable(),
  clientMessageId: z.string().uuid(),
  type: MessageTypeSchema,
  text: z.string().nullable(),
  attachmentId: z.string().uuid().nullable(),
  // Inlined so the frontend gets mime/name/size/dimensions/a fresh
  // presigned URL with the message itself, instead of a second round trip
  // to fetch the attachment by `attachmentId`.
  attachment: AttachmentSchema.nullable(),
  durationMs: z.number().int().nullable(),
  waveform: z.array(z.number().int()).nullable(),
  replyToId: z.string().uuid().nullable(),
  // Set only when `type === "call"` — see `MessageCallInfoSchema`.
  call: MessageCallInfoSchema.nullable(),
  reactions: z.array(MessageReactionSchema),
  status: MessageStatusSchema,
  editedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Message = z.infer<typeof MessageSchema>;
