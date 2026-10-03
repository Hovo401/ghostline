import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import type { AppConfigService } from "../config/app-config.service";

import { signChatActionToken } from "./action-token";
import { NotificationActionGuard } from "./notification-action.guard";

const SECRET = "s".repeat(32);
const guard = new NotificationActionGuard({
  jwt: { accessSecret: SECRET },
} as unknown as AppConfigService);

function contextWith(query: Record<string, unknown>) {
  const request: Record<string, unknown> = { query };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { request, context };
}

describe("NotificationActionGuard", () => {
  it("sets the user and chat the token names", () => {
    const { request, context } = contextWith({ t: signChatActionToken(SECRET, "u-1", "c-1") });

    expect(guard.canActivate(context)).toBe(true);
    expect(request).toMatchObject({ userId: "u-1", notificationChatId: "c-1" });
  });

  it("rejects a missing or forged token", () => {
    expect(() => guard.canActivate(contextWith({}).context)).toThrow(UnauthorizedException);
    expect(() =>
      guard.canActivate(contextWith({ t: signChatActionToken("x".repeat(32), "u", "c") }).context),
    ).toThrow(UnauthorizedException);
  });
});
