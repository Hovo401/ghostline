import { resolveMotionEnabled, useAppearanceStore } from "../theme/appearance-store";

/**
 * "Typing" dots — DESIGN-BRIEF §5: three 6px dots, each rising 3px on a
 * 900ms loop, 150ms apart. Ported from ghost-ui.js's `Dots` custom element
 * as plain CSS (`animate-typing-dot`, defined in shared/theme/theme.css)
 * since React doesn't need the Web Animations API for this. Freezes (still
 * visible, not moving) when motion is disabled — never fully hidden, since
 * the dots also carry the "is typing" state.
 */
export function Dots({ className }: { className?: string }) {
  const decrypt = useAppearanceStore((state) => state.decrypt);
  const motionOn = resolveMotionEnabled(decrypt);

  return (
    <span className={["inline-flex items-center gap-1", className].filter(Boolean).join(" ")}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={
            motionOn
              ? "h-1.5 w-1.5 rounded-full bg-current animate-typing-dot"
              : "h-1.5 w-1.5 rounded-full bg-current opacity-70"
          }
          style={motionOn ? { animationDelay: `${String(i * 150)}ms` } : undefined}
        />
      ))}
    </span>
  );
}
