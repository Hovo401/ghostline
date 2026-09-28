import type { ChatListItem } from "../../entities/chat";
import { formatDuration, type Message } from "../../entities/message";

/** `Избранное` (Saved Messages) has no `peer` — REQUIREMENTS.md §5.4. */
export function chatDisplayName(chat: ChatListItem): string {
  return chat.peer?.displayName ?? "Избранное";
}

export function formatChatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function previewForType(message: Message): string {
  switch (message.type) {
    case "image":
      return "Фото";
    case "file":
      return message.attachment?.name ? `Файл · ${message.attachment.name}` : "Файл";
    case "voice":
      return message.durationMs != null
        ? `Голосовое · ${formatDuration(message.durationMs)}`
        : "Голосовое";
    case "video":
      return message.durationMs != null
        ? `Видео · ${formatDuration(message.durationMs)}`
        : "Видеосообщение";
    case "text":
    default:
      return "";
  }
}

/** `Вы: …` / `Олег: …` preview line — DESIGN-BRIEF.md §7.2. Media types get
 * a type/duration/name label instead of the raw text (F4). */
export function chatPreview(chat: ChatListItem, currentUserId: string | null): string {
  const last = chat.lastMessage;
  if (!last) return "";
  if (last.deletedAt) return "Сообщение удалено";
  const text = last.type === "text" ? (last.text ?? "") : previewForType(last);
  const mine = last.senderId !== null && last.senderId === currentUserId;
  return mine ? `Вы: ${text}` : text;
}
