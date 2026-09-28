/** `0:07` / `1:03` — mm:ss, no leading zero on minutes. Shared by the
 * voice/video bubble's duration label, the chat-list preview
 * ("Голосовое · 0:12") and the composer's live recording timer. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toFixed(0)}:${String(seconds).padStart(2, "0")}`;
}
