/**
 * Forces a "Save as" download for a presigned attachment URL. A plain
 * `<a download>` only honors `download` for a same-origin `href` — media
 * URLs are presigned SeaweedFS/S3 links on a different origin, so browsers
 * silently ignore the attribute and just navigate/open the image inline.
 * Fetching the bytes ourselves and handing the browser a same-origin
 * `blob:` URL sidesteps that. If the fetch itself is blocked (e.g. no CORS
 * on the presigned host), falling back to a plain anchor still lets the
 * user save the file via the browser's own image context menu/viewer.
 */
export async function downloadAttachment(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${String(response.status)}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(objectUrl, filename);
    URL.revokeObjectURL(objectUrl);
  } catch {
    triggerAnchorDownload(url, filename);
  }
}

function triggerAnchorDownload(href: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
