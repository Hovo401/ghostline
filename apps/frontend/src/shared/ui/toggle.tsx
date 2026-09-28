/**
 * Switch — DESIGN-BRIEF §7.3 "Переключатели": 44–48×26–28px pill, on =
 * accent fill + `ink` knob, off = `line` fill + `fg` knob, 200–250ms
 * transition (§9). `role="switch"` per §10.
 */
export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}

export function Toggle({ checked, onChange, label, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        onChange(!checked);
      }}
      className={[
        "relative h-7 w-12 shrink-0 rounded-full border border-transparent transition-colors duration-200",
        checked ? "[background:var(--color-accent)]" : "bg-line",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={[
          "absolute top-1 left-1 h-5 w-5 rounded-full transition-transform duration-200",
          checked ? "translate-x-5 bg-ink" : "translate-x-0 bg-fg",
        ].join(" ")}
      />
    </button>
  );
}
