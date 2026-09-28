import type {
  MeResponse,
  UserSearchResponse,
  UsernameAvailabilityResponse,
} from "@ghostline/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type Redis from "ioredis";

import { computePresenceView } from "../common/visibility.util";
import { PrismaService } from "../prisma/prisma.service";
import { isOnline } from "../realtime/presence.service";
import { REDIS_CLIENT } from "../redis/redis.module";

const SEARCH_RESULT_LIMIT = 20;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      // Only reachable if the user was deleted after the access token was
      // issued (account deletion is v1, FR-AUTH-11) — not expected today.
      throw new NotFoundException("user not found");
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarKey: user.avatarKey,
      bio: user.bio,
      // The caller is authenticated as this user, so they're online right
      // now by definition.
      online: true,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      showOnline: user.showOnline,
      readReceipts: user.readReceipts,
    };
  }

  async checkAvailability(username: string): Promise<UsernameAvailabilityResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    return { available: !existing };
  }

  /** FR-USER-02: search by username or display name, excluding the viewer themselves. */
  async searchUsers(viewerId: string, q: string): Promise<UserSearchResponse> {
    const term = q.trim();
    if (!term) return [];

    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { showOnline: true },
    });
    if (!viewer) return [];

    const candidates = await this.prisma.user.findMany({
      where: {
        id: { not: viewerId },
        OR: [
          { username: { contains: term, mode: "insensitive" } },
          { displayName: { contains: term, mode: "insensitive" } },
        ],
      },
      take: SEARCH_RESULT_LIMIT,
    });
    if (candidates.length === 0) return [];

    const blockedIds = await this.getBlockedIdsAmong(
      viewerId,
      candidates.map((c) => c.id),
    );

    return Promise.all(
      candidates.map(async (candidate) => {
        const blocked = blockedIds.has(candidate.id);
        const online = blocked ? false : await isOnline(this.redis, candidate.id);
        const presence = computePresenceView(viewer.showOnline, candidate, online, blocked);
        return {
          id: candidate.id,
          username: candidate.username,
          displayName: candidate.displayName,
          avatarKey: blocked ? null : candidate.avatarKey,
          bio: blocked ? null : candidate.bio,
          online: presence.online,
          lastSeenAt: presence.lastSeenAt,
        };
      }),
    );
  }

  /** FR-USER-05. Idempotent — blocking an already-blocked user is a no-op. */
  async blockUser(userId: string, blockedId: string): Promise<void> {
    if (userId === blockedId) {
      throw new BadRequestException("can't block yourself");
    }
    await this.prisma.block.upsert({
      where: { userId_blockedId: { userId, blockedId } },
      update: {},
      create: { userId, blockedId },
    });
  }

  async unblockUser(userId: string, blockedId: string): Promise<void> {
    await this.prisma.block.deleteMany({ where: { userId, blockedId } });
  }

  /**
   * FR-USER-05: a block severs the relationship in both directions —
   * neither side can message the other or see their precise status/photo,
   * regardless of which of them placed the block.
   */
  async isBlockedEitherWay(aId: string, bId: string): Promise<boolean> {
    const count = await this.prisma.block.count({
      where: {
        OR: [
          { userId: aId, blockedId: bId },
          { userId: bId, blockedId: aId },
        ],
      },
    });
    return count > 0;
  }

  private async getBlockedIdsAmong(viewerId: string, candidateIds: string[]): Promise<Set<string>> {
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { userId: viewerId, blockedId: { in: candidateIds } },
          { blockedId: viewerId, userId: { in: candidateIds } },
        ],
      },
      select: { userId: true, blockedId: true },
    });
    return new Set(blocks.map((b) => (b.userId === viewerId ? b.blockedId : b.userId)));
  }
}
