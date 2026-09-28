import { z } from "zod";

/** Message types, delivery status, send request and the wire resource shape. */

export const MessageTypeSchema = z.enum(["text", "image", "file", "voice", "video"]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

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

export const MessageSchema = z.object({
  id: z.string().uuid(),
  chatId: z.string().uuid(),
  seq: z.coerce.bigint(),
  senderId: z.string().uuid().nullable(),
  clientMessageId: z.string().uuid(),
  type: MessageTypeSchema,
  text: z.string().nullable(),
  attachmentId: z.string().uuid().nullable(),
  durationMs: z.number().int().nullable(),
  waveform: z.array(z.number().int()).nullable(),
  replyToId: z.string().uuid().nullable(),
  status: MessageStatusSchema,
  editedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Message = z.infer<typeof MessageSchema>;
