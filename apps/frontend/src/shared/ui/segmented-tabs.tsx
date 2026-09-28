/**
 * Segmented control — DESIGN-BRIEF §4 "Сегментные переключатели": bordered
 * `line`, radius 10–12px, the selected segment fills with `fg` and its text
 * flips to `bg` (e.g. "Вход / Регистрация", size/bubble settings).
 */
export interface SegmentedTabsProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      className={["inline-flex rounded-xl border border-line p-1", className]
        .filter(Boolean)
        .join(" ")}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              onChange(opt.value);
            }}
            className={[
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200",
              selected ? "bg-fg text-bg" : "text-mute",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
