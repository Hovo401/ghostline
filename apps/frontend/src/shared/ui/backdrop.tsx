import { useEffect } from "react";

/**
 * Dimmed full-screen layer under a modal/side panel — clicking it or
 * pressing Escape closes whatever sits on top. Stays mounted while closed
 * (`open=false` fades it out and lets clicks through) so callers can
 * animate their own panel alongside it.
 */
export interface BackdropProps {
  open: boolean;
  onClose: () => void;
  /** Extra classes — e.g. `bg-transparent` for a light popover menu. */
  className?: string;
}

export function Backdrop({ open, onClose, className }: BackdropProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div
      aria-hidden
      data-testid="backdrop"
      onClick={onClose}
      className={[
        "fixed inset-0 z-40 bg-black/55 transition-opacity duration-300",
        open ? "opacity-100" : "pointer-events-none opacity-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
