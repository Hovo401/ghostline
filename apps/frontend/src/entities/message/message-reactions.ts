import type { MessageReaction } from "@ghostline/contracts";

import type { ChatMessage } from "./message.types";

/** FR-MSG-13: the one-tap row in the message menu; "＋" opens the full picker. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

/** The emoji `userId` reacted with, if any — a user holds at most one per message. */
export function myReaction(message: ChatMessage, userId: string | null): string | null {
  if (userId === null) return null;
  return message.reactions.find((reaction) => reaction.userIds.includes(userId))?.emoji ?? null;
}

/**
 * Optimistic mirror of the backend's `setReaction`: drops `userId` from
 * whichever group holds them, then (unless `emoji` is null) adds them to
 * `emoji`'s group — a new group goes last, like the server's ordering by
 * first reaction.
 */
export function applyReaction(
  message: ChatMessage,
  userId: string,
  emoji: string | null,
): ChatMessage {
  const without = message.reactions.flatMap((reaction): MessageReaction[] => {
    if (!reaction.userIds.includes(userId)) return [reaction];
    const userIds = reaction.userIds.filter((id) => id !== userId);
    return userIds.length > 0 ? [{ ...reaction, count: userIds.length, userIds }] : [];
  });
  if (emoji === null) return { ...message, reactions: without };

  const existing = without.find((reaction) => reaction.emoji === emoji);
  const reactions = existing
    ? without.map((reaction) =>
        reaction === existing
          ? { ...reaction, count: reaction.count + 1, userIds: [...reaction.userIds, userId] }
          : reaction,
      )
    : [...without, { emoji, count: 1, userIds: [userId] }];
  return { ...message, reactions };
}
