import type { ReactNode } from "react";

/**
 * Desktop navigation rail — DESIGN-BRIEF §4/§7.2: 76px wide, logo square
 * (36px, accent fill, `g`) at top, nav items in the middle, my avatar at
 * the bottom (leads to profile). Content is passed in — this owns layout
 * and the logo mark only, not routing.
 */
export interface RailProps {
  items: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Rail({ items, footer, className }: RailProps) {
  return (
    <nav
      className={[
        "flex h-full w-19 flex-col items-center gap-6 border-r border-line bg-bg py-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-semibold [background:var(--color-accent)] text-ink"
      >
        g
      </span>
      <div className="flex flex-1 flex-col items-center gap-4">{items}</div>
      {footer}
    </nav>
  );
}
