import type { Attachment, MessageType } from "@ghostline/contracts";

const SMALL_IMAGE_BYTES = 1024 * 1024;
const FRESH_IMAGE_BYTES = 10 * 1024 * 1024;
const FRESH_AV_BYTES = 5 * 1024 * 1024;

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

function isConstrainedNetwork(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) return false;
  return (
    connection.saveData === true ||
    connection.effectiveType === "slow-2g" ||
    connection.effectiveType === "2g"
  );
}

/**
 * Whether a bubble's media downloads without a tap (docs/adr/0013):
 * - a picked `video` never does — it streams in the viewer on demand;
 * - `isFresh` (arrived over the socket this session): photos ≤ 10 MB,
 *   voice/video notes ≤ 5 MB;
 * - history: photos ≤ 1 MB, unless Save-Data / 2g is on.
 * Everything else shows a "↓ size" button.
 */
export function shouldAutoDownload(
  messageType: MessageType,
  attachment: Attachment,
  isFresh: boolean,
): boolean {
  if (messageType === "video") return false;
  const isImage = messageType === "image";
  const isAv = messageType === "voice" || messageType === "video_note";
  if (isFresh) {
    if (isImage) return attachment.size <= FRESH_IMAGE_BYTES;
    if (isAv) return attachment.size <= FRESH_AV_BYTES;
    return false;
  }
  if (isConstrainedNetwork()) return false;
  return isImage && attachment.size <= SMALL_IMAGE_BYTES;
}
