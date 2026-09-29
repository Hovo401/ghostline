import { AttachmentSchema, type Attachment } from "@ghostline/contracts";

import { apiFetch } from "../../shared/api/http-client";

function triggerAnchorDownload(href: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Downloads an attachment via a plain `<a download>` navigation instead of
 * fetching the bytes into a `blob:` URL first — the old
 * `features/media-viewer/download-attachment.ts` did that, which loads the
 * whole file into memory before saving it; fine for a photo, not for a
 * 1 GiB video (T-032). The presigned URL already sets
 * `Content-Disposition: attachment; filename*=UTF-8''<name>` (RFC 5987, so
 * Cyrillic names survive) server-side, so a same-origin `download`
 * attribute isn't even needed for the browser to save rather than navigate
 * — `download` is still passed as a same-origin-friendly fallback name.
 *
 * Always fetches a fresh `Attachment` via `GET /attachments/:id` first
 * rather than trying to track a per-message "older than ~9 minutes"
 * threshold — simpler, and the extra round trip is negligible next to an
 * up-to-1 GiB download.
 */
export async function downloadAttachment(attachment: Attachment): Promise<void> {
  try {
    const fresh = await apiFetch(`/attachments/${attachment.id}`);
    const parsed = AttachmentSchema.parse(fresh);
    triggerAnchorDownload(parsed.url, parsed.name ?? attachment.id);
  } catch {
    // The refresh failed (network blip, or the caller's URL is still
    // fresh) — fall back to the URL already on hand rather than blocking
    // the download entirely.
    triggerAnchorDownload(attachment.url, attachment.name ?? attachment.id);
  }
}
