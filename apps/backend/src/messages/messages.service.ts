import type {
  ListMessagesQuery,
  Message,
  MessageDeletedPayload,
  SendMessageRequest,
} from "@ghostline/contracts";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type Redis from "ioredis";

import { ChatsService } from "../chats/chats.service";
import { PrismaService } from "../prisma/prisma.service";
import { ChatEventsGateway } from "../realtime/chat-events.gateway";
import { isOnline } from "../realtime/presence.service";
import { REDIS_CLIENT } from "../redis/redis.module";
import { UsersService } from "../users/users.service";

import { resolveMessageStatus, toPrismaMessageType, toWireMessage } from "./message.util";

const HISTORY_PAGE_SIZE = 50;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly chats: ChatsService,
    private readonly events: ChatEventsGateway,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** FR-MSG-01/05-08: text-only send — server allocates `seq` atomically per chat. */
  async sendMessage(userId: string, dto: SendMessageRequest): Promise<Message> {
    if (dto.type !== "text") {
      // TODO(T-032/F4): image/file/voice/video messages need the attachment
      // pipeline (presigned upload, processing) — reject outright rather
      // than half-supporting a type nothing can actually populate yet.
      throw new BadRequestException("only text messages are supported until T-032/F4 lands media");
    }

    const membership = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: dto.chatId, userId } },
    });
    if (!membership) {
      throw new NotFoundException("chat not found");
    }
    await this.assertNotBlockedInChat(dto.chatId, userId);

    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // Row-level lock on the `UPDATE` serializes concurrent senders in
        // the same chat — each transaction sees the post-increment value,
        // so two racing sends can never get the same `seq`
        // (docs/ARCHITECTURE.md: ordering is server-authoritative).
        const updatedChat = await tx.chat.update({
          where: { id: dto.chatId },
          data: { lastSeq: { increment: 1 }, lastMessageAt: new Date() },
        });
        const seq = updatedChat.lastSeq;
        const message = await tx.message.create({
          data: {
            chatId: dto.chatId,
            seq,
            senderId: userId,
            clientMessageId: dto.clientMessageId,
            type: toPrismaMessageType(dto.type),
            text: dto.text ?? null,
            replyToId: dto.replyToId ?? null,
          },
        });
        // The sender has trivially "read" and "received" their own
        // message — keeps `unreadCount = chat.lastSeq - lastReadSeq`
        // correct without excluding your own messages everywhere else.
        await tx.chatMember.update({
          where: { chatId_userId: { chatId: dto.chatId, userId } },
          data: { lastReadSeq: seq, lastDeliveredSeq: seq },
        });
        return message;
      });
    } catch (error) {
      const retried = await this.recoverFromDuplicateSend(error, userId, dto.clientMessageId);
      if (retried) return retried;
      throw error;
    }

    const wireMessage = toWireMessage(created, await resolveMessageStatus(this.prisma, created));

    await this.emitToMembers(dto.chatId, (memberId) =>
      this.events.server.to(`user:${memberId}`).emit("message:new", wireMessage),
    );
    await this.markDeliveredForOnlineMembers(dto.chatId, created.seq, userId);
    await this.pushChatUpdated(dto.chatId);

    return wireMessage;
  }

  /** FR-MSG-05: own text messages only, marked `editedAt`. */
  async editMessage(userId: string, messageId: string, text: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) {
      throw new NotFoundException("message not found");
    }
    if (message.senderId !== userId) {
      throw new ForbiddenException("can only edit your own messages");
    }
    if (message.type !== "TEXT") {
      throw new BadRequestException("only text messages can be edited until T-032/F4 lands media");
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { text, editedAt: new Date() },
    });
    const wireMessage = toWireMessage(updated, await resolveMessageStatus(this.prisma, updated));

    await this.emitToMembers(updated.chatId, (memberId) =>
      this.events.server.to(`user:${memberId}`).emit("message:updated", wireMessage),
    );
    await this.pushChatUpdated(updated.chatId);

    return wireMessage;
  }

  /** FR-MSG-06 (own messages only — "delete for everyone" is always available for your own). */
  async deleteMessage(userId: string, messageId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) {
      throw new NotFoundException("message not found");
    }
    if (message.senderId !== userId) {
      throw new ForbiddenException("can only delete your own messages");
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), text: null },
    });

    const payload: MessageDeletedPayload = { chatId: message.chatId, messageId };
    await this.emitToMembers(message.chatId, (memberId) =>
      this.events.server.to(`user:${memberId}`).emit("message:deleted", payload),
    );
    await this.pushChatUpdated(message.chatId);
  }

  /** `beforeSeq` pages older history; `afterSeq` catches up after reconnect (FR-RT-05/T-015). */
  async listMessages(userId: string, query: ListMessagesQuery): Promise<Message[]> {
    await this.chats.assertMember(query.chatId, userId);

    const catchingUp = query.afterSeq !== undefined;
    const where: Prisma.MessageWhereInput = { chatId: query.chatId };
    if (catchingUp) {
      where.seq = { gt: query.afterSeq };
    } else if (query.beforeSeq !== undefined) {
      where.seq = { lt: query.beforeSeq };
    }

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: { seq: catchingUp ? "asc" : "desc" },
      take: HISTORY_PAGE_SIZE,
    });
    // Paging backwards fetches newest-first for a correct `LIMIT`, then
    // flips to chronological order for the client.
    const ordered = catchingUp ? rows : rows.slice().reverse();

    const messages = await Promise.all(
      ordered.map(async (row) => toWireMessage(row, await resolveMessageStatus(this.prisma, row))),
    );

    await this.markDelivered(query.chatId, userId, messages);
    return messages;
  }

  private async assertNotBlockedInChat(chatId: string, userId: string): Promise<void> {
    const other = await this.prisma.chatMember.findFirst({
      where: { chatId, userId: { not: userId } },
    });
    if (other && (await this.users.isBlockedEitherWay(userId, other.userId))) {
      throw new ForbiddenException("can't message a blocked user");
    }
  }

  /** FR-MSG-08: a retried optimistic send returns the already-created message instead of erroring. */
  private async recoverFromDuplicateSend(
    error: unknown,
    senderId: string,
    clientMessageId: string,
  ): Promise<Message | null> {
    const isDuplicate =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!isDuplicate) return null;

    const existing = await this.prisma.message.findUnique({
      where: { senderId_clientMessageId: { senderId, clientMessageId } },
    });
    if (!existing) return null;
    return toWireMessage(existing, await resolveMessageStatus(this.prisma, existing));
  }

  private async emitToMembers(chatId: string, emit: (userId: string) => void): Promise<void> {
    const members = await this.prisma.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });
    for (const member of members) emit(member.userId);
  }

  /** Pushes each member's own `ChatListItem` — unread count/last message preview differ per viewer. */
  private async pushChatUpdated(chatId: string): Promise<void> {
    const members = await this.prisma.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });
    for (const member of members) {
      const item = await this.chats.getChatListItemForUser(chatId, member.userId);
      this.events.server.to(`user:${member.userId}`).emit("chat:updated", item);
    }
  }

  /**
   * Stand-in for a socket delivery ack (FR-RT-04): a member with a live
   * connection just received this message over the WS push above, so
   * treat it as delivered. Offline members catch up — and get marked
   * delivered — via `listMessages` instead.
   */
  private async markDeliveredForOnlineMembers(
    chatId: string,
    seq: bigint,
    senderId: string,
  ): Promise<void> {
    const others = await this.prisma.chatMember.findMany({
      where: { chatId, userId: { not: senderId } },
    });
    for (const member of others) {
      if (member.lastDeliveredSeq >= seq) continue;
      if (await isOnline(this.redis, member.userId)) {
        await this.prisma.chatMember.update({
          where: { chatId_userId: { chatId, userId: member.userId } },
          data: { lastDeliveredSeq: seq },
        });
      }
    }
  }

  private async markDelivered(chatId: string, userId: string, messages: Message[]): Promise<void> {
    if (messages.length === 0) return;
    const maxSeq = messages.reduce((max, m) => (m.seq > max ? m.seq : max), 0n);
    const membership = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!membership || membership.lastDeliveredSeq >= maxSeq) return;
    await this.prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastDeliveredSeq: maxSeq },
    });
  }
}
