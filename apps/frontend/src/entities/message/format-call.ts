import { formatDuration } from "./format-duration";
import type { ChatMessage } from "./message.types";

const CALL_STATUS_LABEL = {
  missed: "Пропущенный",
  declined: "Отклонённый",
  cancelled: "Отменённый",
} as const;

/** "Исходящий видеозвонок · 5:23" / "Пропущенный аудиозвонок" — one wording
 * for the call bubble and the chat-list preview. `isOwn` = the current user
 * placed the call. */
export function formatCallLabel(call: NonNullable<ChatMessage["call"]>, isOwn: boolean): string {
  const kind = call.video ? "видеозвонок" : "аудиозвонок";
  if (call.status !== "ended") return `${CALL_STATUS_LABEL[call.status]} ${kind}`;
  const duration = call.durationMs != null ? ` · ${formatDuration(call.durationMs)}` : "";
  return `${isOwn ? "Исходящий" : "Входящий"} ${kind}${duration}`;
}
