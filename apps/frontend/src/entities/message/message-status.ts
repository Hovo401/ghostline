import type { ChatMessage } from "./message.types";

export interface MessageMeta {
  text: string;
  /** Only "прочитано" on the last outgoing message reads in accent color —
   * DESIGN-BRIEF.md §7.2. */
  accent: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/**
 * `13:42 · ✓✓ прочитано` — DESIGN-BRIEF.md §7.2/§5: incoming messages only
 * ever show the time; outgoing messages show a glyph (◷ sending, ✓ sent,
 * ✓✓ delivered/read) except the *last* outgoing message in the thread,
 * which spells the status out as a word instead of a glyph.
 */
export function formatMessageMeta(
  message: ChatMessage,
  isOwn: boolean,
  isLastOutgoing: boolean,
): MessageMeta {
  const time = `${message.editedAt ? "изменено " : ""}${formatTime(message.createdAt)}`;
  // A call row is history, not something that gets delivered/read.
  if (!isOwn || message.type === "call") return { text: time, accent: false };

  if (message.failed) return { text: `${time} · не отправлено`, accent: false };
  if (message.pending) {
    return { text: isLastOutgoing ? `${time} · отправка` : `${time} · ◷`, accent: false };
  }

  switch (message.status) {
    case "sent":
      return { text: `${time} · ${isLastOutgoing ? "отправлено" : "✓"}`, accent: false };
    case "delivered":
      return { text: `${time} · ${isLastOutgoing ? "доставлено" : "✓✓"}`, accent: false };
    case "read":
      return { text: `${time} · ${isLastOutgoing ? "прочитано" : "✓✓"}`, accent: isLastOutgoing };
    default:
      return { text: time, accent: false };
  }
}

/** Types whose `text` the sender can change — the message itself or a
 * photo/video/file caption (mirrors the backend's `editMessage` check). */
const EDITABLE_TYPES: ReadonlySet<ChatMessage["type"]> = new Set([
  "text",
  "image",
  "video",
  "file",
]);

function isSettledOwn(message: ChatMessage, currentUserId: string | null): boolean {
  return (
    currentUserId !== null &&
    message.senderId === currentUserId &&
    !message.pending &&
    !message.failed &&
    !message.deletedAt
  );
}

/** FR-MSG-05: own, already-sent messages that carry user-authored text. */
export function canEditMessage(message: ChatMessage, currentUserId: string | null): boolean {
  return isSettledOwn(message, currentUserId) && EDITABLE_TYPES.has(message.type);
}

/** FR-MSG-06 (MVP): "delete for everyone", own already-sent messages only. */
export function canDeleteMessage(message: ChatMessage, currentUserId: string | null): boolean {
  return isSettledOwn(message, currentUserId);
}

/** Whether a bubble gets a context menu at all (FR-MSG-11) — a peer's voice
 * message has no text to copy and isn't ours to edit/delete. */
export function hasMessageActions(message: ChatMessage, currentUserId: string | null): boolean {
  return (
    !!message.text ||
    canEditMessage(message, currentUserId) ||
    canDeleteMessage(message, currentUserId)
  );
}
