import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";

/**
 * Text input — DESIGN-BRIEF §4: height 50–52px, radius 12px, `panel`
 * background, `line` border, focus ring in `accent-t` per §10.
 */
export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, id, className, ...props },
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
      {hint && <span className="font-mono text-xs text-mute">{hint}</span>}
    </div>
  );
});
