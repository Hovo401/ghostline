import { z } from "zod";

/** Presigned upload flow: request a PUT URL, then confirm the upload. */

export const AttachmentKindSchema = z.enum(["image", "file", "voice", "video", "avatar"]);
export type AttachmentKind = z.infer<typeof AttachmentKindSchema>;

export const PresignUploadRequestSchema = z.object({
  kind: AttachmentKindSchema,
  mime: z.string().min(1),
  size: z.number().int().positive(),
  fileName: z.string().min(1).max(255),
});
export type PresignUploadRequest = z.infer<typeof PresignUploadRequestSchema>;

export const PresignUploadResponseSchema = z.object({
  attachmentId: z.string().uuid(),
  uploadUrl: z.string().url(),
});
export type PresignUploadResponse = z.infer<typeof PresignUploadResponseSchema>;

export const CompleteUploadRequestSchema = z.object({
  attachmentId: z.string().uuid(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type CompleteUploadRequest = z.infer<typeof CompleteUploadRequestSchema>;

export const AttachmentSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  name: z.string().nullable(),
  // Computed at read time from `StorageService.createDownloadUrl` — never
  // persisted (see docs/adr on embedding presigned media URLs). A fresh,
  // short-lived GET URL every time this is served, so `<img>`/`<audio>`/
  // `<video>` tags can load it without an `Authorization` header.
  url: z.string().url(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/** `GET /chats/:id/media` response — the chat's `ProfilePanel` media grid. */
export const ChatMediaResponseSchema = z.array(AttachmentSchema);
export type ChatMediaResponse = z.infer<typeof ChatMediaResponseSchema>;
