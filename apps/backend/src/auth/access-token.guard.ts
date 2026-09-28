import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";

import { TokenService } from "./token.service";

export interface AuthenticatedRequest {
  headers: { authorization?: string };
  userId: string;
}

/**
 * Verifies the `Authorization: Bearer <access token>` header and attaches
 * the decoded user id to the request for `@CurrentUserId()`. Throws (via
 * `TokenService.verifyAccessToken`) on a missing/expired/invalid token.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("missing access token");
    }
    const payload = this.tokens.verifyAccessToken(token);
    request.userId = payload.sub;
    return true;
  }
}
