import { randomBytes, randomUUID } from "node:crypto";

import type { AuthTokenResponse, LoginRequest, RegisterRequest } from "@ghostline/contracts";
import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { User } from "@prisma/client";
import * as argon2 from "argon2";

import { toAvatarUrl } from "../attachments/attachment.util";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { isUsernameTaken } from "../users/username.util";

import { TokenService } from "./token.service";
import { REFRESH_TOKEN_TTL_MS } from "./token.types";

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Registration, login and refresh-token rotation (FR-AUTH-01, 05, 06, 08).
 * Recovery-phrase login (FR-AUTH-13–16, T-002) and invites (T-003) are
 * deferred — `recoveryHash` is filled with an unusable placeholder so the
 * `NOT NULL` column is satisfied without a real recovery flow existing yet.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly storage: StorageService,
  ) {}

  async register(dto: RegisterRequest): Promise<AuthTokenResponse & { refreshToken: string }> {
    const username = dto.username.toLowerCase();
    if (await isUsernameTaken(this.prisma, username)) {
      throw new ConflictException("username already taken");
    }

    const passwordHash = await argon2.hash(dto.password);
    // Placeholder until T-002 implements the real recovery-phrase flow —
    // never derivable from anything the user knows, so it can't be used to
    // log in by accident.
    const recoveryHash = await argon2.hash(randomBytes(32).toString("hex"));

    const user = await this.prisma.user.create({
      data: {
        username,
        displayName: dto.displayName,
        passwordHash,
        recoveryHash,
      },
    });

    const issued = await this.issueSession(user.id);
    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      user: await this.toPublicProfile(user),
    };
  }

  async login(dto: LoginRequest): Promise<AuthTokenResponse & { refreshToken: string }> {
    const identifier = dto.username.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
    // Same message either way — don't leak which part of the credential
    // pair was wrong (FR-AUTH-05).
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException("invalid username or password");
    }

    const issued = await this.issueSession(user.id);
    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      user: await this.toPublicProfile(user),
    };
  }

  /**
   * Rotates the refresh token in place on `Session`. A stale token (one
   * that's already been rotated away, or was revoked) reusing its old hash
   * value is a reuse-detection signal — the whole `familyId` is revoked so
   * every derived session dies, not just this one (FR-AUTH-06).
   */
  async refresh(rawToken: string): Promise<AuthTokenResponse & { refreshToken: string }> {
    const payload = this.tokens.verifyRefreshToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException("session expired");
    }

    const presentedHash = this.tokens.hashRefreshToken(rawToken);
    if (session.revokedAt || presentedHash !== session.tokenHash) {
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // Revoking is a soft update, so the `onDelete: Cascade` never fires —
      // a phone of a hijacked family must stop receiving pushes now.
      await this.prisma.nativePushDevice.deleteMany({
        where: { session: { familyId: session.familyId } },
      });
      throw new UnauthorizedException("refresh token reuse detected");
    }

    const accessToken = this.tokens.signAccessToken(session.userId, session.id);
    const refreshToken = this.tokens.signRefreshToken({
      sub: session.userId,
      sid: session.id,
      familyId: session.familyId,
    });

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: await this.toPublicProfile(session.user),
    };
  }

  /** Best-effort: an already-invalid token still ends up logged out. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    try {
      const payload = this.tokens.verifyRefreshToken(rawToken);
      await this.prisma.session.updateMany({
        where: { id: payload.sid, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // A logged-out phone must stop ringing (docs/adr/0017).
      await this.prisma.nativePushDevice.deleteMany({ where: { sessionId: payload.sid } });
    } catch {
      // Invalid/expired token: nothing to revoke, cookie gets cleared by
      // the caller regardless.
    }
  }

  private async issueSession(userId: string): Promise<IssuedTokens> {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const refreshToken = this.tokens.signRefreshToken({ sub: userId, sid: sessionId, familyId });

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        familyId,
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken: this.tokens.signAccessToken(userId, sessionId), refreshToken };
  }

  /**
   * The caller is always authenticated as `user` here (they just
   * registered/logged in/refreshed), so they're online right now by
   * definition — same reasoning as `UsersService.getMe`.
   */
  private async toPublicProfile(user: User): Promise<AuthTokenResponse["user"]> {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarKey: user.avatarKey,
      avatarUrl: await toAvatarUrl(user.avatarKey, this.storage),
      bio: user.bio,
      online: true,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    };
  }
}
