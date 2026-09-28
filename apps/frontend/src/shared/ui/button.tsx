import type { ButtonHTMLAttributes } from "react";

const VARIANT_CLASS = {
  // `background` (not `bg-accent`/background-color) because `--color-accent`
  // may be a gradient for some accents (aurora/sunset/mint/custom) —
  // DESIGN-BRIEF §2.3. Tailwind has no bg-color-or-gradient utility, so
  // this uses an arbitrary property that still only reads the mapped
  // Tailwind token, never the raw `--gl-*` variable.
  primary: "[background:var(--color-accent)] text-ink",
  secondary: "border border-line bg-panel text-fg",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_CLASS;
}

/** Reference shared/ui component: tokens only, no literal colors. */
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  const classes = ["rounded-xl px-4 py-2 text-sm font-semibold", VARIANT_CLASS[variant], className]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} {...props} />;
}
