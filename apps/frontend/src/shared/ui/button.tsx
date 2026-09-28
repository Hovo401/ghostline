import type { ButtonHTMLAttributes } from "react";

const VARIANT_CLASS = {
  primary: "bg-accent text-ink",
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
