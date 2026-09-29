import { useRef, type PointerEvent } from "react";

/** Click-or-drag seeking on a horizontal track (the voice bubble's
 * waveform, the audio bar's progress line): reports the pointer's
 * position as a 0..1 fraction of the element's width on press and on
 * every move while pressed. Pointer capture keeps the drag alive when
 * the cursor leaves the track. */
export function useSeekPointer(onSeek: (fraction: number) => void) {
  const dragging = useRef(false);

  const report = (event: PointerEvent<HTMLElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
  };

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>): void => {
      dragging.current = true;
      // jsdom has no pointer capture; every browser we target does.
      if ("setPointerCapture" in event.currentTarget) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      report(event);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>): void => {
      if (dragging.current) report(event);
    },
    onPointerUp: (): void => {
      dragging.current = false;
    },
    onPointerCancel: (): void => {
      dragging.current = false;
    },
  };
}
