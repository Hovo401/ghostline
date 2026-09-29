import type { MediaDimensions } from "./attachment.types";

/**
 * Reads intrinsic width/height off an image/video file before it's handed
 * to `POST /attachments/:id/complete` (CompleteUploadRequest.width/height).
 * Best-effort: a decode failure just resolves `null` instead of blocking
 * the send — dimensions are a nice-to-have for the bubble layout, not a
 * requirement.
 */
export function readMediaDimensions(
  file: Blob,
  kind: "image" | "video",
): Promise<MediaDimensions | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const cleanup = (): void => {
      URL.revokeObjectURL(objectUrl);
    };

    if (kind === "image") {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        cleanup();
      };
      img.onerror = () => {
        resolve(null);
        cleanup();
      };
      img.src = objectUrl;
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      cleanup();
    };
    video.onerror = () => {
      resolve(null);
      cleanup();
    };
    video.src = objectUrl;
  });
}
