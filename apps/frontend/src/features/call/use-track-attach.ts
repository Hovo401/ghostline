import type { Track } from "livekit-client";
import { useCallback } from "react";

/** Attaches/detaches a LiveKit `Track` to a real `<video>`/`<audio>` element
 * imperatively (the SDK's own attach model) instead of guessing at
 * `@livekit/components-react`'s `TrackReference` prop shape — see
 * `use-call-session.ts`'s doc comment for why.
 *
 * A callback ref, not `useRef` + `useEffect([track])`: the `<video>` is
 * rendered conditionally (camera toggled, screen minimized → restored), so
 * the element can remount while `track` stays the same — an effect keyed on
 * `track` alone would never attach to the new element (black video). */
export function useTrackAttach(track: Track | null) {
  return useCallback(
    (el: HTMLMediaElement | null) => {
      if (!track || !el) return;
      track.attach(el);
      return () => {
        track.detach(el);
      };
    },
    [track],
  );
}
