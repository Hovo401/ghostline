import { randomUUID } from "node:crypto";

import type {
  Message,
  MessageCallInfo,
  MessageReaction,
  MessageStatus,
  MessageType,
} from "@ghostline/contracts";
import type {
  Attachment as PrismaAttachment,
  Call as PrismaCall,
  Message as PrismaMessage,
  MessageType as PrismaMessageType,
} from "@prisma/client";

import { toWireAttachment } from "../attachments/attachment.util";
import { isMutuallyVisible } from "../common/visibility.util";
import type { PrismaService } from "../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";

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
  video_note: "VIDEO_NOTE",
  call: "CALL",
};

const PRISMA_TO_WIRE_TYPE: Record<PrismaMessageType, MessageType> = {
  TEXT: "text",
  IMAGE: "image",
  FILE: "file",
  VOICE: "voice",
  VIDEO: "video",
  VIDEO_NOTE: "video_note",
  CALL: "call",
};

/** Maps a finished `Call` row onto the `Message.call` wire field (T-06x calls). */
const CALL_STATUS_TO_MESSAGE_CALL_STATUS: Partial<
  Record<PrismaCall["status"], MessageCallInfo["status"]>
> = {
  ENDED: "ended",
  MISSED: "missed",
  DECLINED: "declined",
  CANCELLED: "cancelled",
};

export function toWireMessageCallInfo(call: PrismaCall): MessageCallInfo | null {
  const status = CALL_STATUS_TO_MESSAGE_CALL_STATUS[call.status];
  if (!status) return null; // RINGING/ACTIVE/BUSY/FAILED never become a history row.
  const durationMs =
    call.answeredAt && call.endedAt ? call.endedAt.getTime() - call.answeredAt.getTime() : null;
  return { status, video: call.video, durationMs };
}

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

/** Relations `toWireMessage` needs — every query that feeds it must use this. */
export const MESSAGE_INCLUDE = {
  attachment: true,
  call: true,
  reactions: { select: { userId: true, emoji: true }, orderBy: { createdAt: "asc" } },
} as const;

interface ReactionRow {
  userId: string;
  emoji: string;
}

/** A `Message` row loaded with `MESSAGE_INCLUDE`. */
export type PrismaMessageWithAttachment = PrismaMessage & {
  attachment: PrismaAttachment | null;
  call: PrismaCall | null;
  reactions: ReactionRow[];
};

/** Groups reaction rows (oldest first) by emoji; groups keep the order of their first reaction. */
export function groupReactions(rows: ReactionRow[]): MessageReaction[] {
  const groups = new Map<string, string[]>();
  for (const { emoji, userId } of rows) {
    const userIds = groups.get(emoji);
    if (userIds) userIds.push(userId);
    else groups.set(emoji, [userId]);
  }
  return [...groups].map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
}

export async function toWireMessage(
  message: PrismaMessageWithAttachment,
  status: MessageStatus,
  storage: StorageService,
): Promise<Message> {
  // A deleted message keeps nothing but its shell (old rows may still carry a
  // media/call payload from before delete cleared it).
  const deleted = message.deletedAt !== null;
  return {
    id: message.id,
    chatId: message.chatId,
    seq: message.seq,
    senderId: message.senderId,
    clientMessageId: message.clientMessageId,
    type: toWireMessageType(message.type),
    text: deleted ? null : message.text,
    attachmentId: deleted ? null : message.attachmentId,
    attachment:
      message.attachment && !deleted ? await toWireAttachment(message.attachment, storage) : null,
    durationMs: message.durationMs,
    waveform: message.waveform as number[] | null,
    replyToId: message.replyToId,
    call: message.call && !deleted ? toWireMessageCallInfo(message.call) : null,
    reactions: deleted ? [] : groupReactions(message.reactions),
    status,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

/**
 * Writes the `type: CALL` history row for a finished call — shared by
 * `MessagesService.createCallMessage` (API process) and the ring-timeout
 * processor (worker, no `MessagesService`). The caller has trivially
 * "read" and "received" their own call row, same as in `sendMessage`, so
 * it never counts as unread for them.
 */
export async function createCallMessageRow(
  prisma: PrismaService,
  call: PrismaCall,
): Promise<PrismaMessageWithAttachment> {
  return prisma.$transaction(async (tx) => {
    const updatedChat = await tx.chat.update({
      where: { id: call.chatId },
      data: { lastSeq: { increment: 1 }, lastMessageAt: new Date() },
    });
    const message = await tx.message.create({
      data: {
        chatId: call.chatId,
        seq: updatedChat.lastSeq,
        senderId: call.callerId,
        clientMessageId: randomUUID(),
        type: "CALL",
        callId: call.id,
      },
      include: MESSAGE_INCLUDE,
    });
    await tx.chatMember.update({
      where: { chatId_userId: { chatId: call.chatId, userId: call.callerId } },
      data: { lastReadSeq: updatedChat.lastSeq, lastDeliveredSeq: updatedChat.lastSeq },
    });
    return message;
  });
}
