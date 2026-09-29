import type { PrismaService } from "../prisma/prisma.service";

/**
 * The one place that checks whether a username is already taken — exported
 * as a plain function (not part of `UsersService`) so `AuthService` can
 * reuse it for registration without importing `UsersModule` (which itself
 * imports `AuthModule`; a `UsersModule` -> `AuthModule` -> `UsersModule`
 * cycle otherwise). Same reasoning as `message.util.ts`/`attachment.util.ts`.
 *
 * Always compares lowercased (usernames are case-insensitive, per the
 * `@unique` column and `RegisterRequestSchema`/`UpdateMeRequestSchema`'s
 * `[a-z0-9_]+` regex). `excludeUserId` lets `PATCH /me` no-op a user
 * "changing" their username to the one they already have.
 */
export async function isUsernameTaken(
  prisma: PrismaService,
  username: string,
  excludeUserId?: string,
): Promise<boolean> {
  const existing = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true },
  });
  if (!existing) return false;
  return existing.id !== excludeUserId;
}
