import { randomUUID } from "node:crypto";

import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";

interface FakeUserRow {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  passwordHash: string;
  recoveryHash: string;
  avatarKey: string | null;
  bio: string | null;
  showOnline: boolean;
  readReceipts: boolean;
  lastSeenAt: Date | null;
}

interface FakeSessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  previousTokenHash?: string | null;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * In-memory stand-in for the two Prisma models this service touches —
 * enough of the real `PrismaService` surface (`findUnique`/`findFirst`/
 * `create`/`update`/`updateMany`) to exercise the refresh-rotation and
 * reuse-detection logic end to end without a real database.
 */
function createFakePrisma() {
  const users = new Map<string, FakeUserRow>();
  const sessions = new Map<string, FakeSessionRow>();
  /** `NativePushDevice` rows, by device id → owning session id. */
  const nativeDevices = new Map<string, string>();

  return {
    users,
    sessions,
    nativeDevices,
    nativePushDevice: {
      deleteMany: ({
        where,
      }: {
        where: { sessionId?: string; session?: { familyId: string } };
      }) => {
        let count = 0;
        for (const [deviceId, sessionId] of nativeDevices) {
          const matches =
            where.sessionId !== undefined
              ? sessionId === where.sessionId
              : sessions.get(sessionId)?.familyId === where.session?.familyId;
          if (matches) {
            nativeDevices.delete(deviceId);
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
    },
    user: {
      findUnique: ({ where }: { where: { id?: string; username?: string } }) => {
        if (where.id) return Promise.resolve(users.get(where.id) ?? null);
        if (where.username) {
          return Promise.resolve(
            [...users.values()].find((u) => u.username === where.username) ?? null,
          );
        }
        return Promise.resolve(null);
      },
      findFirst: ({ where }: { where: { OR: Record<string, string>[] } }) => {
        return Promise.resolve(
          [...users.values()].find((u) =>
            where.OR.some((clause) => u.username === clause.username || u.email === clause.email),
          ) ?? null,
        );
      },
      create: ({
        data,
      }: {
        data: Omit<
          FakeUserRow,
          "id" | "email" | "avatarKey" | "bio" | "showOnline" | "readReceipts" | "lastSeenAt"
        >;
      }) => {
        const row: FakeUserRow = {
          id: randomUUID(),
          email: null,
          avatarKey: null,
          bio: null,
          showOnline: true,
          readReceipts: true,
          lastSeenAt: null,
          ...data,
        };
        users.set(row.id, row);
        return Promise.resolve(row);
      },
    },
    session: {
      create: ({ data }: { data: FakeSessionRow }) => {
        const row: FakeSessionRow = {
          ...data,
          previousTokenHash: data.previousTokenHash ?? null,
          revokedAt: data.revokedAt ?? null,
        };
        sessions.set(row.id, row);
        return Promise.resolve(row);
      },
      findUnique: ({ where }: { where: { id: string } }) => {
        const session = sessions.get(where.id);
        if (!session) return Promise.resolve(null);
        return Promise.resolve({ ...session, user: users.get(session.userId) });
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<FakeSessionRow> }) => {
        const existing = sessions.get(where.id);
        if (!existing) throw new Error("session not found");
        const updated = { ...existing, ...data };
        sessions.set(where.id, updated);
        return Promise.resolve(updated);
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { familyId?: string; id?: string; revokedAt?: null };
        data: Partial<FakeSessionRow>;
      }) => {
        let count = 0;
        for (const [id, session] of sessions) {
          const matchesFamily = where.familyId === undefined || session.familyId === where.familyId;
          const matchesId = where.id === undefined || session.id === where.id;
          const matchesRevoked =
            where.revokedAt === undefined || session.revokedAt === where.revokedAt;
          if (matchesFamily && matchesId && matchesRevoked) {
            sessions.set(id, { ...session, ...data });
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
    },
  };
}

async function buildAuthService() {
  const fakePrisma = createFakePrisma();
  const fakeConfig = {
    jwt: { accessSecret: "a".repeat(32), refreshSecret: "b".repeat(32) },
  } as AppConfigService;

  const fakeStorage = { createDownloadUrl: () => Promise.resolve("http://example.test/avatar") };

  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      TokenService,
      JwtService,
      { provide: PrismaService, useValue: fakePrisma },
      { provide: AppConfigService, useValue: fakeConfig },
      { provide: StorageService, useValue: fakeStorage },
    ],
  }).compile();

  return {
    authService: moduleRef.get(AuthService),
    tokenService: moduleRef.get(TokenService),
    fakePrisma,
  };
}

describe("AuthService", () => {
  let ctx: Awaited<ReturnType<typeof buildAuthService>>;

  beforeEach(async () => {
    ctx = await buildAuthService();
  });

  describe("register", () => {
    it("creates a user and issues a token pair", async () => {
      const result = await ctx.authService.register({
        username: "alice",
        password: "password123",
        displayName: "Alice",
      });

      expect(result.user.username).toBe("alice");
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(ctx.tokenService.verifyAccessToken(result.accessToken).sub).toBe(result.user.id);
    });

    it("rejects a duplicate username", async () => {
      await ctx.authService.register({
        username: "alice",
        password: "password123",
        displayName: "Alice",
      });

      await expect(
        ctx.authService.register({
          username: "alice",
          password: "password456",
          displayName: "Alice 2",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("login", () => {
    it("issues a token pair for correct credentials", async () => {
      await ctx.authService.register({
        username: "bob",
        password: "password123",
        displayName: "Bob",
      });

      const result = await ctx.authService.login({ username: "bob", password: "password123" });
      expect(result.user.username).toBe("bob");
      expect(result.accessToken).toEqual(expect.any(String));
    });

    it("rejects a wrong password", async () => {
      await ctx.authService.register({
        username: "bob",
        password: "password123",
        displayName: "Bob",
      });

      await expect(
        ctx.authService.login({ username: "bob", password: "wrong-password" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejects an unknown username", async () => {
      await expect(
        ctx.authService.login({ username: "ghost", password: "password123" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("refresh", () => {
    it("rotates the refresh token and keeps the same session/family", async () => {
      const registered = await ctx.authService.register({
        username: "carol",
        password: "password123",
        displayName: "Carol",
      });

      const rotated = await ctx.authService.refresh(registered.refreshToken);

      expect(rotated.user.id).toBe(registered.user.id);
      expect(rotated.refreshToken).not.toBe(registered.refreshToken);

      const oldPayload = ctx.tokenService.verifyRefreshToken(registered.refreshToken);
      const newPayload = ctx.tokenService.verifyRefreshToken(rotated.refreshToken);
      expect(newPayload.sid).toBe(oldPayload.sid);
      expect(newPayload.familyId).toBe(oldPayload.familyId);
    });

    it("rejects an unknown session", async () => {
      const foreignToken = ctx.tokenService.signRefreshToken({
        sub: randomUUID(),
        sid: randomUUID(),
        familyId: randomUUID(),
      });

      await expect(ctx.authService.refresh(foreignToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("detects reuse of an already-rotated token and revokes the whole family", async () => {
      const registered = await ctx.authService.register({
        username: "dave",
        password: "password123",
        displayName: "Dave",
      });

      // Rotate twice — `registered.refreshToken` is now two rotations old (ADR-0021 only forgives one).
      const first = await ctx.authService.refresh(registered.refreshToken);
      await ctx.authService.refresh(first.refreshToken);

      // Replaying the stale token must be rejected...
      await expect(ctx.authService.refresh(registered.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      // ...and revoke the current (rotated) session too, since it shares
      // the family.
      const payload = ctx.tokenService.verifyRefreshToken(registered.refreshToken);
      const session = ctx.fakePrisma.sessions.get(payload.sid);
      expect(session?.revokedAt).not.toBeNull();
    });

    it("deletes the family's native push devices on reuse, so a hijacked phone stops ringing", async () => {
      const registered = await ctx.authService.register({
        username: "frank",
        password: "password123",
        displayName: "Frank",
      });
      const { sid } = ctx.tokenService.verifyRefreshToken(registered.refreshToken);
      ctx.fakePrisma.nativeDevices.set("device-1", sid);

      const first = await ctx.authService.refresh(registered.refreshToken);
      await ctx.authService.refresh(first.refreshToken);
      await expect(ctx.authService.refresh(registered.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(ctx.fakePrisma.nativeDevices.size).toBe(0);
    });

    it("accepts the previous token once, so a client that lost the rotated cookie stays logged in", async () => {
      const registered = await ctx.authService.register({
        username: "heidi",
        password: "password123",
        displayName: "Heidi",
      });
      const { sid } = ctx.tokenService.verifyRefreshToken(registered.refreshToken);

      await ctx.authService.refresh(registered.refreshToken);
      // The rotated cookie never reached the disk: the client comes back with the old one.
      const retried = await ctx.authService.refresh(registered.refreshToken);
      // ...and can retry again if that response is lost too.
      await ctx.authService.refresh(registered.refreshToken);

      expect(retried.user.id).toBe(registered.user.id);
      expect(ctx.fakePrisma.sessions.get(sid)?.revokedAt).toBeNull();
    });

    it("stops accepting the previous token once the current one has been used", async () => {
      const registered = await ctx.authService.register({
        username: "ivan",
        password: "password123",
        displayName: "Ivan",
      });
      const { sid } = ctx.tokenService.verifyRefreshToken(registered.refreshToken);

      const first = await ctx.authService.refresh(registered.refreshToken);
      await ctx.authService.refresh(first.refreshToken);

      await expect(ctx.authService.refresh(registered.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(ctx.fakePrisma.sessions.get(sid)?.revokedAt).not.toBeNull();
    });

    it("keeps the session id in the rotated access token", async () => {
      const registered = await ctx.authService.register({
        username: "gina",
        password: "password123",
        displayName: "Gina",
      });
      const { sid } = ctx.tokenService.verifyRefreshToken(registered.refreshToken);

      const rotated = await ctx.authService.refresh(registered.refreshToken);

      expect(ctx.tokenService.verifyAccessToken(rotated.accessToken).sid).toBe(sid);
    });
  });

  describe("logout", () => {
    it("revokes the session so its refresh token can no longer be used", async () => {
      const registered = await ctx.authService.register({
        username: "erin",
        password: "password123",
        displayName: "Erin",
      });

      await ctx.authService.logout(registered.refreshToken);

      await expect(ctx.authService.refresh(registered.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("deletes only this session's native push devices", async () => {
      const first = await ctx.authService.register({
        username: "hank",
        password: "password123",
        displayName: "Hank",
      });
      const second = await ctx.authService.login({ username: "hank", password: "password123" });
      ctx.fakePrisma.nativeDevices.set(
        "phone",
        ctx.tokenService.verifyRefreshToken(first.refreshToken).sid,
      );
      ctx.fakePrisma.nativeDevices.set(
        "tablet",
        ctx.tokenService.verifyRefreshToken(second.refreshToken).sid,
      );

      await ctx.authService.logout(first.refreshToken);

      expect([...ctx.fakePrisma.nativeDevices.keys()]).toEqual(["tablet"]);
    });

    it("is a no-op for a missing token", async () => {
      await expect(ctx.authService.logout(undefined)).resolves.toBeUndefined();
    });
  });
});
