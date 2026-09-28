import type { ChatListItem } from "../../entities/chat";
import type { MessageType } from "../../entities/message";

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

function previewForType(type: MessageType): string {
  switch (type) {
    case "image":
      return "Фото";
    case "file":
      return "Файл";
    case "voice":
      return "Голосовое сообщение";
    case "video":
      return "Видеосообщение";
    case "text":
    default:
      return "";
  }
}

/** `Вы: …` / `Олег: …` preview line — DESIGN-BRIEF.md §7.2. Media types get
 * a placeholder label until F4 renders the real bubble. */
export function chatPreview(chat: ChatListItem, currentUserId: string | null): string {
  const last = chat.lastMessage;
  if (!last) return "";
  if (last.deletedAt) return "Сообщение удалено";
  const text = last.type === "text" ? (last.text ?? "") : previewForType(last.type);
  const mine = last.senderId !== null && last.senderId === currentUserId;
  return mine ? `Вы: ${text}` : text;
}
