import type { ChatListItem, ChatMediaResponse, ReadUpdatedPayload } from "@ghostline/contracts";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Chat } from "@prisma/client";
import type Redis from "ioredis";

import { toAvatarUrl, toWireAttachment } from "../attachments/attachment.util";
import { computePresenceView, isMutuallyVisible } from "../common/visibility.util";
import { resolveMessageStatus, toWireMessage } from "../messages/message.util";
import { PrismaService } from "../prisma/prisma.service";
import { ChatEventsGateway } from "../realtime/chat-events.gateway";
import { isOnline } from "../realtime/presence.service";
import { REDIS_CLIENT } from "../redis/redis.module";
import { StorageService } from "../storage/storage.service";
import { UsersService } from "../users/users.service";

import { clampReadSeq, computeUnreadCount } from "./unread.util";

const CHAT_MEDIA_LIMIT = 30;

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly events: ChatEventsGateway,
    private readonly storage: StorageService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** FR-LIST-01: every chat the user is a member of, newest activity first. */
  async listChats(userId: string): Promise<ChatListItem[]> {
    await this.ensureSavedChat(userId);

    const memberships = await this.prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true, chat: { select: { lastMessageAt: true, createdAt: true } } },
    });
    const ordered = memberships.sort((a, b) => {
      const aTime = (a.chat.lastMessageAt ?? a.chat.createdAt).getTime();
      const bTime = (b.chat.lastMessageAt ?? b.chat.createdAt).getTime();
      return bTime - aTime;
    });

    return Promise.all(ordered.map((m) => this.getChatListItemForUser(m.chatId, userId)));
  }

  /** FR-CHAT-01/FR-USER-05: get-or-create a direct chat, blocked pairs can't open one. */
  async openDirect(userId: string, peerId: string): Promise<ChatListItem> {
    if (userId === peerId) {
      throw new BadRequestException("use Saved Messages to message yourself");
    }
    const peer = await this.prisma.user.findUnique({ where: { id: peerId } });
    if (!peer) {
      throw new NotFoundException("user not found");
    }
    if (await this.users.isBlockedEitherWay(userId, peerId)) {
      throw new ForbiddenException("can't open a chat with a blocked user");
    }

    const directKey = directKeyFor(userId, peerId);
    const existing = await this.prisma.chat.findUnique({ where: { directKey } });
    const chat =
      existing ??
      (await this.prisma.chat.create({
        data: {
          type: "DIRECT",
          directKey,
          members: { create: [{ userId }, { userId: peerId }] },
        },
      }));

    const item = await this.getChatListItemForUser(chat.id, userId);
    if (!existing) {
      // Own-device sync only for the peer for now — they get nothing to
      // read yet (see `listChats`'s "no lastMessage" case), but their other
      // devices/this device both need the chat to exist locally too.
      this.events.server.to(`user:${userId}`).emit("chat:updated", item);
      const peerItem = await this.getChatListItemForUser(chat.id, peerId);
      this.events.server.to(`user:${peerId}`).emit("chat:updated", peerItem);
    }
    return item;
  }

  /**
   * FR-RT-04/FR-USER-08: marks up to `upToSeq` (default: everything) as read
   * for `userId`, and — unless read receipts are off on either side —
   * tells the other member(s) so their UI can update in real time.
   */
  async markRead(userId: string, chatId: string, upToSeq?: bigint): Promise<void> {
    const [chat, membership] = await Promise.all([
      this.prisma.chat.findUnique({ where: { id: chatId } }),
      this.prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } }),
    ]);
    if (!chat || !membership) {
      throw new NotFoundException("chat not found");
    }

    const target = clampReadSeq(upToSeq ?? chat.lastSeq, membership.lastReadSeq, chat.lastSeq);
    if (target <= membership.lastReadSeq) return;

    await this.prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: {
        lastReadSeq: target,
        lastDeliveredSeq:
          target > membership.lastDeliveredSeq ? target : membership.lastDeliveredSeq,
      },
    });

    const others = await this.prisma.chatMember.findMany({
      where: { chatId, userId: { not: userId } },
      include: { user: { select: { readReceipts: true } } },
    });
    if (others.length === 0) return;

    const [viewer] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { readReceipts: true } }),
    ]);

    const payload: ReadUpdatedPayload = { chatId, userId, lastReadSeq: target };
    for (const other of others) {
      if (!isMutuallyVisible(viewer.readReceipts, other.user.readReceipts)) continue;
      this.events.server.to(`user:${other.userId}`).emit("read:updated", payload);
    }
  }

  async setMuted(userId: string, chatId: string, muted: boolean): Promise<void> {
    const membership = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!membership) {
      throw new NotFoundException("chat not found");
    }
    await this.prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { muted },
    });
  }

  async assertMember(chatId: string, userId: string): Promise<void> {
    const membership = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!membership) {
      throw new NotFoundException("chat not found");
    }
  }

  /**
   * `ProfilePanel`'s "МЕДИА" grid (T-032/F4): the chat's most recent
   * finished media messages, newest first. `TEXT` messages and attachments
   * still `PENDING`/being processed are excluded — nothing for the grid to
   * render for those. Reuses `toWireAttachment` so the shape matches
   * `Message.attachment` exactly (same mime/name/size/dimensions/URL).
   */
  async listMedia(chatId: string, userId: string): Promise<ChatMediaResponse> {
    await this.assertMember(chatId, userId);

    const rows = await this.prisma.message.findMany({
      where: {
        chatId,
        deletedAt: null,
        type: { not: "TEXT" },
        attachment: { is: { status: "READY" } },
      },
      orderBy: { seq: "desc" },
      take: CHAT_MEDIA_LIMIT,
      include: { attachment: true },
    });

    return Promise.all(
      rows
        .map((row) => row.attachment)
        .filter((attachment): attachment is NonNullable<typeof attachment> => attachment !== null)
        .map((attachment) => toWireAttachment(attachment, this.storage)),
    );
  }

  /**
   * Builds one user's view of a chat — peer identity/presence, unread
   * count and last-message preview all depend on who's asking, so this
   * can't be cached/shared across members. Used by `listChats` and by
   * `MessagesService` to push a fresh `chat:updated` per member after a
   * send/edit/delete.
   */
  async getChatListItemForUser(chatId: string, viewerId: string): Promise<ChatListItem> {
    const [chat, membership, viewer] = await Promise.all([
      this.prisma.chat.findUniqueOrThrow({ where: { id: chatId } }),
      this.prisma.chatMember.findUniqueOrThrow({
        where: { chatId_userId: { chatId, userId: viewerId } },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: viewerId },
        select: { showOnline: true },
      }),
    ]);

    const unreadCount = computeUnreadCount(chat.lastSeq, membership.lastReadSeq);

    let peer: ChatListItem["peer"] = null;
    if (chat.type === "DIRECT") {
      const otherMembership = await this.prisma.chatMember.findFirst({
        where: { chatId, userId: { not: viewerId } },
        include: { user: true },
      });
      if (otherMembership) {
        const peerUser = otherMembership.user;
        const blocked = await this.users.isBlockedEitherWay(viewerId, peerUser.id);
        const online = blocked ? false : await isOnline(this.redis, peerUser.id);
        const presence = computePresenceView(viewer.showOnline, peerUser, online, blocked);
        peer = {
          id: peerUser.id,
          username: peerUser.username,
          displayName: peerUser.displayName,
          avatarKey: blocked ? null : peerUser.avatarKey,
          avatarUrl: blocked ? null : await toAvatarUrl(peerUser.avatarKey, this.storage),
          online: presence.online,
        };
      }
    }

    const lastMessageRow = await this.prisma.message.findFirst({
      where: { chatId },
      orderBy: { seq: "desc" },
      include: { attachment: true },
    });
    let lastMessage: ChatListItem["lastMessage"] = null;
    if (lastMessageRow) {
      const status = await resolveMessageStatus(this.prisma, lastMessageRow);
      lastMessage = await toWireMessage(lastMessageRow, status, this.storage);
    }

    return {
      id: chat.id,
      type: chat.type,
      peer,
      lastMessage,
      unreadCount,
      muted: membership.muted,
      updatedAt: (chat.lastMessageAt ?? chat.createdAt).toISOString(),
    };
  }

  /**
   * FR-CHAT-02: Saved Messages is created lazily, the first time a user's
   * chat list is requested (rather than at registration) — keeps
   * `AuthService.register` from needing to know about `ChatsService`.
   */
  private async ensureSavedChat(userId: string): Promise<Chat> {
    const directKey = savedChatKeyFor(userId);
    const existing = await this.prisma.chat.findUnique({ where: { directKey } });
    if (existing) return existing;
    return this.prisma.chat.create({
      data: {
        type: "SAVED",
        directKey,
        members: { create: [{ userId }] },
      },
    });
  }
}

function directKeyFor(aId: string, bId: string): string {
  return [aId, bId].sort().join(":");
}

function savedChatKeyFor(userId: string): string {
  // `saved:` can never collide with the sorted `uuid:uuid` shape `directKeyFor`
  // produces — a UUID is never literally the string "saved".
  return `saved:${userId}`;
}
