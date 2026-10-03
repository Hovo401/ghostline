import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { AppConfigService } from "../config/app-config.service";

import { TokenService } from "./token.service";

async function buildTokenService() {
  const fakeConfig = {
    jwt: { accessSecret: "a".repeat(32), refreshSecret: "b".repeat(32) },
  } as AppConfigService;

  const moduleRef = await Test.createTestingModule({
    providers: [TokenService, JwtService, { provide: AppConfigService, useValue: fakeConfig }],
  }).compile();

  return moduleRef.get(TokenService);
}

describe("TokenService", () => {
  it("round-trips an access token", async () => {
    const tokens = await buildTokenService();
    const token = tokens.signAccessToken("user-1", "session-1");
    // `verify` also returns the standard `iat`/`exp` claims jsonwebtoken adds
    // on sign — only the claims this service put there are asserted here.
    expect(tokens.verifyAccessToken(token)).toMatchObject({ sub: "user-1" });
  });

  it("round-trips a refresh token, adding a unique jti per issuance", async () => {
    const tokens = await buildTokenService();
    const claims = { sub: "user-1", sid: "session-1", familyId: "family-1" };
    const tokenA = tokens.signRefreshToken(claims);
    const tokenB = tokens.signRefreshToken(claims);

    expect(tokens.verifyRefreshToken(tokenA)).toMatchObject(claims);
    // Same claims, minted twice: still distinct tokens/jti, which is what
    // makes rotation and reuse detection work within the same second.
    expect(tokenA).not.toBe(tokenB);
    expect(tokens.verifyRefreshToken(tokenA).jti).not.toBe(tokens.verifyRefreshToken(tokenB).jti);
  });

  it("rejects a refresh token verified as an access token (different secrets)", async () => {
    const tokens = await buildTokenService();
    const refreshToken = tokens.signRefreshToken({
      sub: "user-1",
      sid: "session-1",
      familyId: "family-1",
    });
    expect(() => tokens.verifyAccessToken(refreshToken)).toThrow(UnauthorizedException);
  });

  it("rejects a garbage token", async () => {
    const tokens = await buildTokenService();
    expect(() => tokens.verifyAccessToken("not-a-jwt")).toThrow(UnauthorizedException);
  });

  it("hashes a refresh token deterministically", async () => {
    const tokens = await buildTokenService();
    const hashA = tokens.hashRefreshToken("some-token");
    const hashB = tokens.hashRefreshToken("some-token");
    const hashC = tokens.hashRefreshToken("other-token");
    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
  });
});
