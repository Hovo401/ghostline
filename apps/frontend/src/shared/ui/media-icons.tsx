/** Play/pause glyphs shared by the voice/video-note bubbles, the round
 * video player and the audio top bar. */
export function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ marginLeft: 2 }} aria-hidden>
      <path d="M3 1.5v11l9.5-5.5z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="2.5" y="1.5" width="3.2" height="11" rx="1" fill="currentColor" />
      <rect x="8.3" y="1.5" width="3.2" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}

/** ⏮ / ⏭ — previous/next voice message in the audio top bar. */
export function PrevTrackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M8 8l6.5-5v10zM1.5 8L8 3v10z" fill="currentColor" />
    </svg>
  );
}

export function NextTrackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M8 8L1.5 3v10zM14.5 8L8 3v10z" fill="currentColor" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}
