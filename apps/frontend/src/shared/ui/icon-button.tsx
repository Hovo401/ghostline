import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Icon-only button — DESIGN-BRIEF §4 (linear icons, stroke 1.8, 20px) /
 * §10 (`aria-label` required — the prototype used `title`, brief explicitly
 * calls out adding this). Touch target stays ≥44px per §10 even though the
 * icon itself is 20px.
 */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  /** "inverse" is white-on-dark for overlays like the fullscreen media
   * viewer's `bg-black/90` chrome (VideoNoteBubble's existing `text-white`
   * on `bg-black/*` is the same already-accepted pattern) — the default
   * `ghost` token colors (`text-fg`) don't read against that regardless of
   * the active theme. */
  variant?: "ghost" | "accent" | "inverse";
}

export function IconButton({
  icon,
  label,
  variant = "ghost",
  className,
  ...props
}: IconButtonProps) {
  const variantClass =
    variant === "accent"
      ? "[background:var(--color-accent)] text-ink"
      : variant === "inverse"
        ? "text-white hover:bg-white/10"
        : "text-fg hover:bg-bg2";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        "inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-200",
        variantClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {icon}
    </button>
  );
}
