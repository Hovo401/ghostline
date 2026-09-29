import { useEffect, useRef, useState } from "react";

// Ambient JSX typing for the `<ghost-field>` custom element — see
// ghost-field.d.ts (picked up automatically, no import needed).

export interface GhostFieldProps {
  layout?: "center" | "right" | "wall";
  /** Defaults to 2600 (desktop) per DESIGN-BRIEF §6.2; pass 1300 on phone. */
  count?: number;
  morph?: number;
  className?: string;
}

/**
 * React wrapper around `<ghost-field>` (three.js custom element) —
 * DESIGN-BRIEF.md §6.2/§11 DR-05: three.js is its own lazy chunk, never
 * loaded as part of `/app`. Only the tiny custom-element shim import is
 * dynamic; the element itself renders immediately so layout doesn't shift.
 */
export function GhostField({
  layout = "center",
  count = 2600,
  morph = 0,
  className,
}: GhostFieldProps) {
  const [ready, setReady] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void import("./ghost-field-element")
      .then(({ registerGhostField }) => {
        if (cancelled) return;
        registerGhostField();
        setReady(true);
      })
      .catch(() => {
        // Best-effort: the component may unmount (or, in tests, the jsdom
        // environment may tear down) before this chunk finishes loading —
        // ghost-field is decorative, so fail silently instead of surfacing
        // an unhandled rejection.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={["relative h-full w-full overflow-hidden", className].filter(Boolean).join(" ")}
    >
      {ready && <ghost-field layout={layout} count={count} morph={morph} />}
    </div>
  );
}
