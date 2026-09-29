import { createHash, randomUUID } from "node:crypto";

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { AppConfigService } from "../config/app-config.service";

import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  type AccessTokenPayload,
  type RefreshTokenClaims,
  type RefreshTokenPayload,
} from "./token.types";

/**
 * Signs/verifies the two JWT kinds (access, refresh) and hashes refresh
 * tokens for `Session.tokenHash`. Exported by `AuthModule` so both the
 * HTTP auth flow and `RealtimeGateway`'s handshake check share one
 * implementation instead of each parsing JWTs on their own.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  signAccessToken(userId: string): string {
    const payload: AccessTokenPayload = { sub: userId };
    return this.jwt.sign(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.jwt.accessSecret,
      });
    } catch {
      throw new UnauthorizedException("invalid or expired access token");
    }
  }

  signRefreshToken(claims: RefreshTokenClaims): string {
    const payload: RefreshTokenPayload = { ...claims, jti: randomUUID() };
    return this.jwt.sign(payload, {
      secret: this.config.jwt.refreshSecret,
      expiresIn: REFRESH_TOKEN_TTL,
    });
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      return this.jwt.verify<RefreshTokenPayload>(token, {
        secret: this.config.jwt.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException("invalid or expired refresh token");
    }
  }

  /** `Session.tokenHash` stores this, never the raw refresh token. */
  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
