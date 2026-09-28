const UNITS = ["Б", "КБ", "МБ", "ГБ"] as const;

/** `530 Б` / `2.4 МБ` — file chip byte count, DESIGN-BRIEF.md §7.2's file
 * bubble (`m.size`). One decimal place from KB up, none for bytes. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return `0 ${UNITS[0]}`;
  if (bytes < 1024) return `${bytes.toFixed(0)} ${UNITS[0]}`;

  let value = bytes / 1024;
  let unitIndex = 1;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const unit = UNITS[unitIndex] ?? "ГБ";
  return `${value.toFixed(1)} ${unit}`;
}
