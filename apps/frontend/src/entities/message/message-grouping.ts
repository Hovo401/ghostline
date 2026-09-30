import type { ChatMessage } from "./message.types";

export interface GroupedMessage {
  message: ChatMessage;
  isOwn: boolean;
  /** First message of a run from the same sender — the feed adds extra
   * top spacing here (DESIGN-BRIEF.md §7.2: "между сменой автора — отступ
   * 12 px"). Direct chats don't need a sender-name label (only groups do,
   * out of scope for F3), just the spacing break. */
  groupStart: boolean;
}

/** Pure so it's cheap to unit-test independent of rendering — `messages`
 * must already be ascending by `seq`. */
export function groupMessages(
  messages: ChatMessage[],
  currentUserId: string | null,
): GroupedMessage[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    return {
      message,
      isOwn: currentUserId !== null && message.senderId === currentUserId,
      groupStart: index === 0 || previous?.senderId !== message.senderId,
    };
  });
}

/** Index of the last message sent by `currentUserId` — the only one that
 * gets a spelled-out status word instead of a glyph. */
export function lastOutgoingIndex(messages: ChatMessage[], currentUserId: string | null): number {
  if (currentUserId === null) return -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.senderId === currentUserId && message.type !== "call") return i;
  }
  return -1;
}
