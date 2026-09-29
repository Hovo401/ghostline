import { z } from "zod";

/**
 * Public-facing user shapes: profile as seen by others, `PATCH /me` body,
 * search results and username availability check.
 */

export const UserPublicProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  avatarKey: z.string().nullable(),
  // Computed at read time from `StorageService.createDownloadUrl` — never
  // persisted (same pattern as `Attachment.url`, see attachment.schema.ts).
  avatarUrl: z.string().url().nullable(),
  bio: z.string().nullable(),
  online: z.boolean(),
  lastSeenAt: z.string().datetime().nullable(),
});
export type UserPublicProfile = z.infer<typeof UserPublicProfileSchema>;

export const UpdateMeRequestSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_]+$/)
    .optional(),
  bio: z.string().max(140).nullable().optional(),
  showOnline: z.boolean().optional(),
  readReceipts: z.boolean().optional(),
  // Client uploads via `POST /attachments/presign` (`kind: "avatar"`) +
  // `POST /attachments/:id/complete` first, then sends the resulting id
  // here — the backend never accepts raw file bytes on this route.
  avatarAttachmentId: z.string().uuid().optional(),
});
export type UpdateMeRequest = z.infer<typeof UpdateMeRequestSchema>;

export const UserSearchQuerySchema = z.object({
  q: z.string().min(1).max(64),
});
export type UserSearchQuery = z.infer<typeof UserSearchQuerySchema>;

export const UserSearchResponseSchema = z.array(UserPublicProfileSchema);
export type UserSearchResponse = z.infer<typeof UserSearchResponseSchema>;

export const UsernameAvailabilityResponseSchema = z.object({
  available: z.boolean(),
});
export type UsernameAvailabilityResponse = z.infer<typeof UsernameAvailabilityResponseSchema>;

export const UsernameAvailabilityQuerySchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_]+$/),
});
export type UsernameAvailabilityQuery = z.infer<typeof UsernameAvailabilityQuerySchema>;
