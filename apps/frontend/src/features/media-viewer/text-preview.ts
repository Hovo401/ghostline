export interface TextPreviewResult {
  text: string;
  truncated: boolean;
}

/** Cap on how much of a text attachment `TextPreview` fetches — plenty for
 * a txt/md/log/json/csv note, and bounded so a mislabeled large file
 * doesn't pull megabytes into a `<pre>` (T-032 §4.5). */
export const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;

/** Fetches up to `TEXT_PREVIEW_MAX_BYTES` of `url` as text — a `Range`
 * header keeps the *transfer* itself capped (not just how much of an
 * already-downloaded body gets read), so this stays cheap even for a
 * multi-hundred-MB file mislabeled as text. Falls back to a plain,
 * unranged fetch if the server doesn't honor `Range` (still slices the
 * decoded text afterwards either way). */
export async function fetchTextPreview(url: string): Promise<TextPreviewResult> {
  const response = await fetch(url, {
    headers: { Range: `bytes=0-${TEXT_PREVIEW_MAX_BYTES.toFixed(0)}` },
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`text preview fetch failed: ${response.status.toFixed(0)}`);
  }
  const full = await response.text();
  const truncated = full.length >= TEXT_PREVIEW_MAX_BYTES;
  return { text: full.slice(0, TEXT_PREVIEW_MAX_BYTES), truncated };
}
