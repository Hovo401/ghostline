import { createParamDecorator, UnauthorizedException, type ExecutionContext } from "@nestjs/common";

import type { AuthenticatedRequest } from "./access-token.guard";

/** The `sub` claim `AccessTokenGuard` verified for this request. */
export const CurrentUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.userId;
});

/**
 * The verified token's session id. Routes that need it (per-device state
 * tied to a login) reject a pre-`sid` token with 401, which the client's
 * refresh-and-retry turns into a fresh token carrying one.
 */
export const CurrentSessionId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.sessionId) throw new UnauthorizedException("access token has no session");
  return request.sessionId;
});
