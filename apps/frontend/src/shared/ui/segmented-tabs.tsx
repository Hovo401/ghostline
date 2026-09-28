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
  /** Stretches to the container's full width with each segment sharing it
   * evenly (DESIGN-BRIEF §7.3/§8.4 — phone settings tabs, "Размер текста"/
   * "Форма сообщений"), instead of the default shrink-to-content sizing
   * ("Вход"/"Регистрация"). */
  fill?: boolean;
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  className,
  fill = false,
}: SegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      className={[
        fill ? "flex w-full" : "inline-flex",
        "rounded-xl border border-line p-1",
        className,
      ]
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
              fill ? "flex-1" : "",
              selected ? "bg-fg text-bg" : "text-mute",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
