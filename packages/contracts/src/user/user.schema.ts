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
});
export type UpdateMeRequest = z.infer<typeof UpdateMeRequestSchema>;

export const UserSearchResponseSchema = z.array(UserPublicProfileSchema);
export type UserSearchResponse = z.infer<typeof UserSearchResponseSchema>;

export const UsernameAvailabilityResponseSchema = z.object({
  available: z.boolean(),
});
export type UsernameAvailabilityResponse = z.infer<typeof UsernameAvailabilityResponseSchema>;
