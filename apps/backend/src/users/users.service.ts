import type {
  MeResponse,
  UpdateMeRequest,
  UserPublicProfile,
  UserSearchResponse,
  UsernameAvailabilityResponse,
} from "@ghostline/contracts";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { User } from "@prisma/client";
import type Redis from "ioredis";

import { toAvatarUrl } from "../attachments/attachment.util";
import { computePresenceView } from "../common/visibility.util";
import { PrismaService } from "../prisma/prisma.service";
import { ChatEventsGateway } from "../realtime/chat-events.gateway";
import { isOnline } from "../realtime/presence.service";
import { REDIS_CLIENT } from "../redis/redis.module";
import { StorageService } from "../storage/storage.service";

import { isUsernameTaken } from "./username.util";

const SEARCH_RESULT_LIMIT = 20;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: ChatEventsGateway,
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
      avatarUrl: await toAvatarUrl(user.avatarKey, this.storage),
      bio: user.bio,
      // The caller is authenticated as this user, so they're online right
      // now by definition.
      online: true,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      showOnline: user.showOnline,
      readReceipts: user.readReceipts,
    };
  }

  /**
   * `PATCH /me` (profile settings). `username`'s uniqueness reuses the same
   * check `AuthService.register`/`checkAvailability` do (`isUsernameTaken`);
   * `avatarAttachmentId` must be the caller's own `READY` attachment,
   * presigned with `kind: "avatar"` (T-avatar) — a chat-message attachment
   * can't be repurposed as a profile photo. Broadcasts `user:updated` to
   * everyone who shares a chat with this user so their UI updates without a
   * reload.
   */
  async updateMe(userId: string, dto: UpdateMeRequest): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("user not found");
    }

    let username = user.username;
    if (dto.username !== undefined) {
      username = dto.username.toLowerCase();
      if (username !== user.username && (await isUsernameTaken(this.prisma, username, userId))) {
        throw new ConflictException("username already taken");
      }
    }

    let avatarKey = user.avatarKey;
    if (dto.avatarAttachmentId !== undefined) {
      avatarKey = await this.resolveAvatarKey(userId, dto.avatarAttachmentId);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        username,
        avatarKey,
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.showOnline !== undefined ? { showOnline: dto.showOnline } : {}),
        ...(dto.readReceipts !== undefined ? { readReceipts: dto.readReceipts } : {}),
      },
    });

    const avatarUrl = await toAvatarUrl(updated.avatarKey, this.storage);
    await this.broadcastProfileUpdate(updated, avatarUrl);

    return {
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      avatarKey: updated.avatarKey,
      avatarUrl,
      bio: updated.bio,
      online: true,
      lastSeenAt: updated.lastSeenAt?.toISOString() ?? null,
      showOnline: updated.showOnline,
      readReceipts: updated.readReceipts,
    };
  }

  async checkAvailability(username: string): Promise<UsernameAvailabilityResponse> {
    return { available: !(await isUsernameTaken(this.prisma, username)) };
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
          avatarUrl: blocked ? null : await toAvatarUrl(candidate.avatarKey, this.storage),
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

  /**
   * 404 for "doesn't exist or isn't yours" (no existence leak, same
   * reasoning as `MessagesService.assertUsableAttachment`), 409 for "exists,
   * is yours, but hasn't finished uploading", 400 for "exists, is yours,
   * finished, but wasn't presigned as an avatar".
   */
  private async resolveAvatarKey(userId: string, attachmentId: string): Promise<string> {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (attachment?.uploaderId !== userId) {
      throw new NotFoundException("attachment not found");
    }
    if (attachment.kind !== "AVATAR") {
      throw new BadRequestException("attachment was not uploaded as an avatar");
    }
    if (attachment.status !== "READY") {
      throw new ConflictException("attachment is not ready yet");
    }
    return attachment.key;
  }

  /**
   * FR-USER-04/05: tells every user who shares a chat with `user` that
   * their profile changed, so open chats/the chat list update live instead
   * of on next reload. Reuses the same "who's in a chat with me" query
   * `MessagesService.emitToMembers`/`pushChatUpdated` run per chat — here
   * it's every chat at once, since the same profile fields show up in all
   * of them. Blocked-either-way pairs are skipped entirely: FR-USER-05
   * hides a blocked user's photo/status regardless of which side blocked,
   * so there's nothing for them to receive.
   */
  private async broadcastProfileUpdate(user: User, avatarUrl: string | null): Promise<void> {
    const memberships = await this.prisma.chatMember.findMany({
      where: { userId: user.id },
      select: { chatId: true },
    });
    if (memberships.length === 0) return;

    const chatMates = await this.prisma.chatMember.findMany({
      where: { chatId: { in: memberships.map((m) => m.chatId) }, userId: { not: user.id } },
      select: { userId: true, user: { select: { showOnline: true } } },
      distinct: ["userId"],
    });
    if (chatMates.length === 0) return;

    const online = await isOnline(this.redis, user.id);

    await Promise.all(
      chatMates.map(async (mate) => {
        if (await this.isBlockedEitherWay(user.id, mate.userId)) return;
        const presence = computePresenceView(mate.user.showOnline, user, online, false);
        const payload: UserPublicProfile = {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarKey: user.avatarKey,
          avatarUrl,
          bio: user.bio,
          online: presence.online,
          lastSeenAt: presence.lastSeenAt,
        };
        this.events.server.to(`user:${mate.userId}`).emit("user:updated", payload);
      }),
    );
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
