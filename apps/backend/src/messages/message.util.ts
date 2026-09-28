import type { Message, MessageStatus, MessageType } from "@ghostline/contracts";
import type { Message as PrismaMessage, MessageType as PrismaMessageType } from "@prisma/client";

import { isMutuallyVisible } from "../common/visibility.util";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Pure helpers for building the wire `Message` shape and computing its
 * `status`. Exported as plain functions (not a service) so `ChatsService`
 * can reuse them for `ChatListItem.lastMessage` without importing
 * `MessagesModule` — avoids a Messages↔Chats module cycle (`ChatsService`
 * is what `MessagesService` imports the other way, for `chat:updated`).
 */

const WIRE_TO_PRISMA_TYPE: Record<MessageType, PrismaMessageType> = {
  text: "TEXT",
  image: "IMAGE",
  file: "FILE",
  voice: "VOICE",
  video: "VIDEO",
};

const PRISMA_TO_WIRE_TYPE: Record<PrismaMessageType, MessageType> = {
  TEXT: "text",
  IMAGE: "image",
  FILE: "file",
  VOICE: "voice",
  VIDEO: "video",
};

export function toPrismaMessageType(type: MessageType): PrismaMessageType {
  return WIRE_TO_PRISMA_TYPE[type];
}

export function toWireMessageType(type: PrismaMessageType): MessageType {
  return PRISMA_TO_WIRE_TYPE[type];
}

export interface MemberReadState {
  userId: string;
  lastReadSeq: bigint;
  lastDeliveredSeq: bigint;
}

/**
 * A message's status as seen by its sender: read/delivered/sent based on
 * every *other* chat member's `lastReadSeq`/`lastDeliveredSeq` versus this
 * message's `seq`. Saved Messages has no other member — vacuously "read"
 * (you always see your own note). `readReceiptsVisible` gates "read" per
 * FR-USER-08: when either side has read receipts off, the best status
 * shown is "delivered", never "read".
 */
export function computeMessageStatus(params: {
  seq: bigint;
  otherMembers: MemberReadState[];
  readReceiptsVisible: boolean;
}): MessageStatus {
  const { seq, otherMembers, readReceiptsVisible } = params;
  if (otherMembers.length === 0) return "read";

  const allRead = otherMembers.every((m) => m.lastReadSeq >= seq);
  if (allRead && readReceiptsVisible) return "read";

  const allDelivered = otherMembers.every((m) => m.lastDeliveredSeq >= seq);
  if (allDelivered) return "delivered";

  return "sent";
}

/**
 * `computeMessageStatus` is pure and viewer-independent by design: a
 * message's read/delivered/sent state reflects the *non-sender* member(s)'
 * read state and whether the read-receipt toggle is mutually on between
 * sender and them — the same for whoever is asking, sender or recipient.
 * This wrapper fetches that data; `ChatsService` (list previews) and
 * `MessagesService` (send/edit/history) both call it instead of
 * duplicating the query.
 */
export async function resolveMessageStatus(
  prisma: PrismaService,
  message: PrismaMessage,
): Promise<MessageStatus> {
  const otherRows = await prisma.chatMember.findMany({
    where: {
      chatId: message.chatId,
      ...(message.senderId ? { userId: { not: message.senderId } } : {}),
    },
    select: {
      userId: true,
      lastReadSeq: true,
      lastDeliveredSeq: true,
      user: { select: { readReceipts: true } },
    },
  });

  let readReceiptsVisible = true;
  if (message.senderId && otherRows.length > 0) {
    const sender = await prisma.user.findUnique({
      where: { id: message.senderId },
      select: { readReceipts: true },
    });
    readReceiptsVisible = otherRows.every((m) =>
      isMutuallyVisible(sender?.readReceipts ?? true, m.user.readReceipts),
    );
  }

  return computeMessageStatus({
    seq: message.seq,
    otherMembers: otherRows,
    readReceiptsVisible,
  });
}

export function toWireMessage(message: PrismaMessage, status: MessageStatus): Message {
  return {
    id: message.id,
    chatId: message.chatId,
    seq: message.seq,
    senderId: message.senderId,
    clientMessageId: message.clientMessageId,
    type: toWireMessageType(message.type),
    text: message.text,
    attachmentId: message.attachmentId,
    durationMs: message.durationMs,
    waveform: message.waveform as number[] | null,
    replyToId: message.replyToId,
    status,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}
