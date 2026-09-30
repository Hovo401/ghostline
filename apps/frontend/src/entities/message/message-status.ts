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
  const time = formatTime(message.createdAt);
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
