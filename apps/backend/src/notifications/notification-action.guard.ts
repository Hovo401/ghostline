import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";

import { AppConfigService } from "../config/app-config.service";

import { verifyChatActionToken } from "./action-token";

interface NotificationActionRequest {
  query: { t?: unknown };
  userId: string;
  notificationChatId: string;
}

/**
 * Authorizes the Android notification actions ("Ответить"/"Прочитано",
 * docs/adr/0017) by the `?t=` chat action token the push carried, in place
 * of an access token — the app's notification receivers run without the
 * WebView or a session. Sets the same `request.userId` `@CurrentUserId()`
 * reads, plus the one chat the token is good for (`@NotificationChatId()`).
 */
@Injectable()
export class NotificationActionGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<NotificationActionRequest>();
    const token = typeof request.query.t === "string" ? request.query.t : "";
    const claims = verifyChatActionToken(this.config.jwt.accessSecret, token);
    if (!claims) throw new UnauthorizedException("invalid or expired notification token");
    request.userId = claims.userId;
    request.notificationChatId = claims.chatId;
    return true;
  }
}

/** The chat `NotificationActionGuard`'s token authorizes. */
export const NotificationChatId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<NotificationActionRequest>().notificationChatId;
});
