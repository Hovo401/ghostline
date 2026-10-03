import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { AppConfigService } from "../config/app-config.service";

import { AccessTokenGuard, type AuthenticatedRequest } from "./access-token.guard";
import { TokenService } from "./token.service";

function contextWithHeader(authorization: string | undefined) {
  const request: AuthenticatedRequest = { headers: { authorization }, userId: "" };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext & { request: AuthenticatedRequest };
}

async function buildGuard() {
  const fakeConfig = {
    jwt: { accessSecret: "a".repeat(32), refreshSecret: "b".repeat(32) },
  } as AppConfigService;

  const moduleRef = await Test.createTestingModule({
    providers: [
      AccessTokenGuard,
      TokenService,
      JwtService,
      { provide: AppConfigService, useValue: fakeConfig },
    ],
  }).compile();

  return {
    guard: moduleRef.get(AccessTokenGuard),
    tokens: moduleRef.get(TokenService),
  };
}

describe("AccessTokenGuard", () => {
  it("rejects a request with no Authorization header", async () => {
    const { guard } = await buildGuard();
    expect(() => guard.canActivate(contextWithHeader(undefined))).toThrow(UnauthorizedException);
  });

  it("rejects a non-Bearer scheme", async () => {
    const { guard } = await buildGuard();
    expect(() => guard.canActivate(contextWithHeader("Basic abc123"))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects an invalid token", async () => {
    const { guard } = await buildGuard();
    expect(() => guard.canActivate(contextWithHeader("Bearer not-a-jwt"))).toThrow(
      UnauthorizedException,
    );
  });

  it("allows a valid token and attaches the userId to the request", async () => {
    const { guard, tokens } = await buildGuard();
    const token = tokens.signAccessToken("user-7", "session-1");
    const context = contextWithHeader(`Bearer ${token}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(context.switchToHttp().getRequest().userId).toBe("user-7");
  });
});
