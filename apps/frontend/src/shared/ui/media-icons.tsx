/** Play/pause glyphs shared by the voice/video-note bubbles and the
 * round video player. */
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
