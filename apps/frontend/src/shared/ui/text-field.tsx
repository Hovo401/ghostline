import type { InputHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

// Hint color — mute by default, accent/danger for live validation states
// like username availability (DESIGN-BRIEF §7.1: "@имя свободно" / "уже занято").
const HINT_TONE_CLASS = {
  mute: "text-mute",
  accent: "text-accent-text",
  danger: "text-danger",
} as const;

/**
 * Text input — DESIGN-BRIEF §4: height 50–52px, radius 12px, `panel`
 * background, `line` border, focus ring in `accent-t` per §10.
 */
export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Usually a short string, but accepts markup for composite hints like
   * the password strength meter (segments + label). */
  hint?: ReactNode;
  hintTone?: keyof typeof HINT_TONE_CLASS;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, hintTone = "mute", id, className, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="font-mono text-xs uppercase tracking-wider text-mute">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={[
          "h-13 rounded-xl border border-line bg-panel px-4 text-sm text-fg outline-none",
          "focus-visible:ring-2 focus-visible:ring-accent-text",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
      {hint && (
        <div className={["font-mono text-xs", HINT_TONE_CLASS[hintTone]].join(" ")}>{hint}</div>
      )}
    </div>
  );
});
