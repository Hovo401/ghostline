/**
 * Pure read/unread math shared by `ChatsService.getChatListItemForUser`
 * (list preview) and `markRead` (clamping what a client is allowed to mark
 * read). Split out so seq arithmetic can be unit-tested without spinning up
 * Prisma.
 */

/** FR-LIST-02: unread count is just "how far behind is this member's read pointer". */
export function computeUnreadCount(lastSeq: bigint, lastReadSeq: bigint): number {
  const diff = lastSeq - lastReadSeq;
  return diff > 0n ? Number(diff) : 0;
}

/** Keeps a client-supplied `upToSeq` within `[currentLastReadSeq, chatLastSeq]` — never rewinds, never overshoots. */
export function clampReadSeq(
  requested: bigint,
  currentLastReadSeq: bigint,
  chatLastSeq: bigint,
): bigint {
  if (requested < currentLastReadSeq) return currentLastReadSeq;
  if (requested > chatLastSeq) return chatLastSeq;
  return requested;
}
