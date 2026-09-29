/**
 * Reads a video file's duration (ms) off a throwaway `<video>` element —
 * used for a video picked from the gallery via the attach menu, since a
 * *recorded* video note already knows its own elapsed time from
 * `recorder-store` and doesn't need this.
 */
export function readVideoDurationMs(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const cleanup = (): void => {
      URL.revokeObjectURL(objectUrl);
    };
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve(Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null);
      cleanup();
    };
    video.onerror = () => {
      resolve(null);
      cleanup();
    };
    video.src = objectUrl;
  });
}
