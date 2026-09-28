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
  variant?: "ghost" | "accent";
}

export function IconButton({
  icon,
  label,
  variant = "ghost",
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        "inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-200",
        variant === "accent" ? "[background:var(--color-accent)] text-ink" : "text-fg hover:bg-bg2",
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
