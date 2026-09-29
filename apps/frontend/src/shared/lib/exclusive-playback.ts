let current: HTMLMediaElement | null = null;

/** Telegram-style "one thing plays at a time" across every audio/video
 * element in the app — the voice player and round video notes both call
 * this right as they start, and whatever claimed playback before is
 * paused. Lives in `shared` so `shared/ui/round-video` and
 * `entities/attachment`'s audio player can both reach it. */
export function claimPlayback(element: HTMLMediaElement): void {
  if (current && current !== element && !current.paused) current.pause();
  current = element;
}
