import { useEffect, useRef, useState } from "react";

import { resolveMotionEnabled, useAppearanceStore } from "../theme/appearance-store";

// Random glyph pool for the "decrypt" effect — DESIGN-BRIEF §5, ported from
// docs/design/prototype/ghost-ui.js's `Scramble` custom element.
const GLYPHS = "ABCDEF0123456789#%&*+=<>/{}[]$@ЖЩЮЯБДФЛΣΩΔλ§±≈";
const randomGlyph = (): string => GLYPHS[(Math.random() * GLYPHS.length) | 0] ?? "#";

export interface ScrambleProps {
  text: string;
  /** Extra start delay in ms — used for the message-list cascade (§5, 70ms step). */
  delay?: number;
  /** Skip the animation and show the final text immediately. */
  instant?: boolean;
  className?: string;
}

/**
 * "Decrypt" text reveal — DESIGN-BRIEF §5: random glyphs resolve left to
 * right over `min(1300, 380 + 16 × length)` ms, one frame every 45ms.
 * Respects the `decrypt` appearance setting and `prefers-reduced-motion`
 * (§8.1/§9/DR-09); the real text is always in the DOM for screen readers
 * (§10) — only the animated frame's visual glyphs are `aria-hidden`.
 */
export function Scramble({ text, delay = 0, instant = false, className }: ScrambleProps) {
  const decrypt = useAppearanceStore((state) => state.decrypt);
  const [display, setDisplay] = useState(text);
  const rafRef = useRef(0);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const motionOn = resolveMotionEnabled(decrypt);
    if (instant || !motionOn || !text) {
      setDisplay(text);
      return;
    }

    const duration = Math.min(1300, 380 + text.length * 16);
    const start = performance.now() + delay;
    setDisplay(text.replace(/\S/g, randomGlyph));

    fallbackRef.current = setTimeout(
      () => {
        cancelAnimationFrame(rafRef.current);
        setDisplay(text);
      },
      duration + delay + 150,
    );

    let last = 0;
    const tick = (now: number): void => {
      const p = (now - start) / duration;
      if (p >= 1) {
        setDisplay(text);
        return;
      }
      if (now - last > 45) {
        last = now;
        let out = "";
        for (let i = 0; i < text.length; i++) {
          const c = text[i] ?? "";
          out += c === " " || c === "\n" || p * 1.25 > i / text.length + 0.2 ? c : randomGlyph();
        }
        setDisplay(out);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(fallbackRef.current);
    };
  }, [text, delay, instant, decrypt]);

  const animating = display !== text;
  return (
    <span className={className}>
      <span aria-hidden={animating || undefined}>{display}</span>
      {animating && <span className="sr-only">{text}</span>}
    </span>
  );
}
