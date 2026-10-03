import { useEffect } from "react";

import { useBackToClose } from "../lib/use-back-to-close";

/**
 * Dimmed full-screen layer under a modal/side panel — clicking it or
 * pressing Escape closes whatever sits on top, and so does the browser/phone
 * Back (`useBackToClose` — every modal, side panel and popover built on
 * this gets Telegram-style Back for free). Stays mounted while closed
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
  useBackToClose(open, onClose);
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
