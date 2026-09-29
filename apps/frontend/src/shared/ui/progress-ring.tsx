/**
 * SVG progress ring — the recipe used by the video-note bubble's play
 * progress, the composer's recording overlay (DESIGN-BRIEF.md §7.2) and the
 * upload/download overlays. A stroked circle with a dash offset, rather than
 * a masked conic-gradient: the mask rendered as a clipped wedge in some
 * browsers.
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
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      aria-hidden
      data-percent={clamped}
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      className={["pointer-events-none -rotate-90", colorClassName, className]
        .filter(Boolean)
        .join(" ")}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        className="transition-[stroke-dashoffset]"
      />
    </svg>
  );
}
