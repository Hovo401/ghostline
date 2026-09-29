interface CallIconProps {
  /** Both `features/chat` (20px, inline header buttons) and `features/call`
   * (22px, larger answer/decline/hangup buttons) draw these — one glyph,
   * one size knob, instead of a second hand-copied component per size. */
  size?: number;
}

/** Shared between `features/chat` (header call buttons, call history rows)
 * and `features/call` (incoming-call answer/decline, in-call hangup) so
 * none of them hand-draws its own phone/camera/hangup glyph — see
 * apps/frontend/CLAUDE.md's layering rule: code more than one feature
 * needs belongs in `shared`, not a sideways feature-to-feature import. */
export function PhoneIcon({ size = 20 }: CallIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 5c0-1 .8-1.5 1.6-1.3l3 .8c.7.2 1.1.9 1 1.6l-.5 2.6c-.1.6-.5 1-1 1.2a8.5 8.5 0 004.5 4.5c.2-.5.6-.9 1.2-1l2.6-.5c.7-.1 1.4.3 1.6 1l.8 3c.2.8-.3 1.6-1.3 1.6C10.8 20.5 3.5 13.2 4.5 5z" />
    </svg>
  );
}

export function VideoCameraIcon({ size = 20 }: CallIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2.5" y="6.5" width="13" height="11" rx="2.2" />
      <path d="M15.5 10.5l6-3.2v9.4l-6-3.2" />
    </svg>
  );
}

export function HangupIcon({ size = 22 }: CallIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 15c5-4 13-4 18 0l-2 3.3c-.4.7-1.3.9-2 .5l-2.8-1.6a1.5 1.5 0 01-.7-1.7l.4-1.5a9 9 0 00-6.8 0l.4 1.5c.2.7-.1 1.4-.7 1.7l-2.8 1.6c-.7.4-1.6.2-2-.5L3 15z"
        fill="currentColor"
      />
    </svg>
  );
}
