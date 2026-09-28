import type {
  ClientToServerEvents,
  PresencePayload,
  ServerToClientEvents,
} from "@ghostline/contracts";
import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import type { Server } from "socket.io";

import { isMutuallyVisible } from "../common/visibility.util";
import { PrismaService } from "../prisma/prisma.service";
import { REDIS_CLIENT } from "../redis/redis.module";

function presenceSocketsKey(userId: string): string {
  return `presence:sockets:${userId}`;
}

/** Whether `userId` has at least one live socket, on this or any other replica (shared via Redis). */
export async function isOnline(redis: Redis, userId: string): Promise<boolean> {
  const count = await redis.scard(presenceSocketsKey(userId));
  return count > 0;
}

/**
 * Presence bookkeeping hooked into `RealtimeGateway`'s connect/disconnect
 * (FR-USER-03/04, FR-RT-03). A user is "online" while at least one of their
 * devices has a live socket — tracked in a Redis set (shared across backend
 * replicas via `REDIS_CLIENT`, not gateway-local state) so a second tab or
 * device doesn't flip them offline when the first one closes.
 */
@Injectable()
export class PresenceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async handleConnect(
    server: Server<ClientToServerEvents, ServerToClientEvents>,
    userId: string,
    socketId: string,
  ): Promise<void> {
    const countBefore = await this.redis.scard(presenceSocketsKey(userId));
    await this.redis.sadd(presenceSocketsKey(userId), socketId);
    if (countBefore === 0) {
      await this.broadcastPresence(server, userId);
    }
  }

  async handleDisconnect(
    server: Server<ClientToServerEvents, ServerToClientEvents>,
    userId: string,
    socketId: string,
  ): Promise<void> {
    await this.redis.srem(presenceSocketsKey(userId), socketId);
    const remaining = await this.redis.scard(presenceSocketsKey(userId));
    if (remaining === 0) {
      await this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
      await this.broadcastPresence(server, userId);
    }
  }

  /** Broadcasts `userId`'s presence to every user they share a direct chat with. */
  private async broadcastPresence(
    server: Server<ClientToServerEvents, ServerToClientEvents>,
    userId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { showOnline: true, lastSeenAt: true },
    });
    if (!user) return;

    const online = await isOnline(this.redis, userId);
    const peerIds = await this.getDirectPeerIds(userId);
    if (peerIds.length === 0) return;

    const [peers, blocks] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: peerIds } },
        select: { id: true, showOnline: true },
      }),
      this.prisma.block.findMany({
        where: {
          OR: [
            { userId, blockedId: { in: peerIds } },
            { blockedId: userId, userId: { in: peerIds } },
          ],
        },
        select: { userId: true, blockedId: true },
      }),
    ]);
    const blockedPeerIds = new Set(
      blocks.map((b) => (b.userId === userId ? b.blockedId : b.userId)),
    );

    for (const peer of peers) {
      if (blockedPeerIds.has(peer.id)) continue;
      const visible = isMutuallyVisible(user.showOnline, peer.showOnline);
      const payload: PresencePayload = {
        userId,
        online: visible && online,
        lastSeenAt: visible && !online ? (user.lastSeenAt?.toISOString() ?? null) : null,
      };
      server.to(`user:${peer.id}`).emit("presence", payload);
    }
  }

  private async getDirectPeerIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.chatMember.findMany({
      where: { userId, chat: { type: "DIRECT" } },
      select: { chatId: true },
    });
    if (memberships.length === 0) return [];
    const otherMembers = await this.prisma.chatMember.findMany({
      where: { chatId: { in: memberships.map((m) => m.chatId) }, userId: { not: userId } },
      select: { userId: true },
    });
    return [...new Set(otherMembers.map((m) => m.userId))];
  }
}
