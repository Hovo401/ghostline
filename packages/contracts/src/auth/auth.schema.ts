import { z } from "zod";

import { UserPublicProfileSchema } from "../user/user.schema";

/** Registration, login, access-token response and `GET /me`. */

export const RegisterRequestSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_]+$/),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthTokenResponseSchema = z.object({
  accessToken: z.string(),
  user: UserPublicProfileSchema,
});
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;

export const MeResponseSchema = UserPublicProfileSchema.extend({
  showOnline: z.boolean(),
  readReceipts: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
