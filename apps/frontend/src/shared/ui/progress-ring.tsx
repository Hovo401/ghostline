/**
 * Conic-gradient progress ring — the recipe used by the video-note bubble's
 * play progress and the composer's recording overlay (DESIGN-BRIEF.md
 * §7.2), pulled out once both need a third caller (the upload overlay).
 * Masked down to just its outer edge so it reads as a ring, not a filled
 * disc — the mask's `#000` marks full-alpha, it isn't a theme color.
 */
export interface ProgressRingProps {
  /** 0-100. */
  percent: number;
  /** Ring diameter in px. */
  size?: number;
  /** Ring thickness in px. */
  strokeWidth?: number;
  /** Tailwind color token for the filled arc — defaults to the accent. */
  colorClassName?: string;
  className?: string;
}

export function ProgressRing({
  percent,
  size = 44,
  strokeWidth = 3,
  colorClassName = "text-accent",
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const ringMask = `radial-gradient(farthest-side, transparent calc(100% - ${(strokeWidth + 1).toFixed(0)}px), #000 calc(100% - ${strokeWidth.toFixed(0)}px))`;

  return (
    <span
      aria-hidden
      data-percent={clamped}
      className={["relative inline-block rounded-full", colorClassName, className]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(currentColor ${clamped.toFixed(0)}%, transparent 0)`,
        WebkitMask: ringMask,
        mask: ringMask,
      }}
    />
  );
}
