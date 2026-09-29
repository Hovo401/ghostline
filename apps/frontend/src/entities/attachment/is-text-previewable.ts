const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_EXACT = new Set(["application/json", "application/csv"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "log", "json", "csv"]);

/** Whether `FileBubble`'s "Просмотр" button (T-032 §4.4) should offer the
 * media viewer's plain-text preview mode for this file — small, obviously
 * textual formats only; anything else keeps just "Скачать". */
export function isTextPreviewable(mime: string, name: string | null): boolean {
  if (TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return true;
  if (TEXT_MIME_EXACT.has(mime)) return true;
  const ext = name?.split(".").pop()?.toLowerCase();
  return ext ? TEXT_EXTENSIONS.has(ext) : false;
}
