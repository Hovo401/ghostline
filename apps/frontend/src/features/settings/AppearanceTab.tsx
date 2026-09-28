import {
  ACCENT_IDS,
  BUBBLE_IDS,
  FONT_IDS,
  SCALE_IDS,
  THEME_IDS,
  useAppearanceStore,
  type AccentId,
  type ThemeId,
} from "../../shared/theme/appearance-store";
import { Scramble } from "../../shared/ui/scramble";
import { SegmentedTabs } from "../../shared/ui/segmented-tabs";
import { Toggle } from "../../shared/ui/toggle";

import {
  ACCENT_LABELS,
  BUBBLE_LABELS,
  FONT_FAMILY,
  FONT_LABELS,
  SCALE_LABELS,
  THEME_LABELS,
} from "./appearance-catalog";

const SELECTED_RING = "shadow-[0_0_0_3px_var(--color-bg),0_0_0_5px_var(--color-fg)]";

/** A theme card's mini preview — real tokens, not a hardcoded hex per
 * theme: nesting `data-theme`/`data-tone` re-scopes `--gl-*` for this
 * subtree exactly like switching the real theme would (theme.css's
 * `[data-theme="…"]` selectors aren't `:root`-only), so `bg-bg`/`bg-in`
 * render that theme's actual colors without this component knowing what
 * they are. "Как в системе" has no colors of its own (it resolves to
 * dark/light) — the split box says so with one dark half, one light half,
 * the same way. "Своя" has no `[data-theme="custom"]` rule to inherit
 * unless `custom` is already the active theme, so it previews the picked
 * `customTheme` colors directly instead. */
function ThemePreviewSwatch({ id }: { id: ThemeId }) {
  // Called unconditionally (rules-of-hooks) even though only the "custom"
  // branch below reads it — `id` never changes for a given card instance,
  // so which branch runs is stable across renders anyway.
  const customTheme = useAppearanceStore((state) => state.customTheme);

  if (id === "system") {
    return (
      <div className="flex h-22 overflow-hidden rounded-[10px] border border-line/25">
        <div data-theme="dark" className="h-full w-1/2 bg-bg" />
        <div data-theme="light" className="h-full w-1/2 bg-bg" />
      </div>
    );
  }
  if (id === "custom") {
    return (
      <div
        className="flex h-22 flex-col justify-center gap-2 rounded-[10px] border border-line/25 p-3.5"
        style={{ background: customTheme.bg }}
      >
        <div className="h-3.5 w-[62%] rounded-full" style={{ background: customTheme.fg }} />
        <div className="h-3.5 w-[48%] self-end rounded-full [background:var(--color-accent)]" />
      </div>
    );
  }
  return (
    <div
      data-theme={id}
      className="flex h-22 flex-col justify-center gap-2 rounded-[10px] border border-line/25 bg-bg p-3.5"
    >
      <div className="h-3.5 w-[62%] rounded-full bg-in" />
      <div className="h-3.5 w-[48%] self-end rounded-full [background:var(--color-accent)] shadow-glow" />
    </div>
  );
}

function ThemeCard({
  id,
  selected,
  onSelect,
}: {
  id: ThemeId;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col gap-2.5 rounded-2xl border-2 p-2.5 text-left"
      style={{ borderColor: selected ? "var(--color-accent-text)" : "var(--color-line)" }}
    >
      <ThemePreviewSwatch id={id} />
      <span className="flex items-center justify-between px-1 text-sm">
        {THEME_LABELS[id]}
        <span
          aria-hidden
          className={["h-4 w-4 rounded-full", selected ? "" : "border-[1.5px] border-mute"].join(
            " ",
          )}
          style={selected ? { border: "5px solid var(--color-accent-text)" } : undefined}
        />
      </span>
    </button>
  );
}

function AccentSwatch({
  id,
  selected,
  onSelect,
}: {
  id: AccentId;
  selected: boolean;
  onSelect: () => void;
}) {
  const customAccent = useAppearanceStore((state) => state.customAccent);
  // `background` (not `background-color`/`bg-accent`) — an accent's fill
  // can be a gradient (aurora/sunset/mint/custom), same reasoning as
  // shared/ui/button.tsx's `VARIANT_CLASS.primary`.
  const fillStyle = {
    background:
      id === "custom"
        ? customAccent.gradient
          ? `linear-gradient(135deg, ${customAccent.color1}, ${customAccent.color2})`
          : customAccent.color1
        : "var(--color-accent)",
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={["flex flex-col items-center gap-2", selected ? "text-fg" : "text-mute"].join(" ")}
    >
      <span
        data-accent={id === "custom" ? undefined : id}
        className={["relative h-11 w-11 rounded-full", selected ? SELECTED_RING : ""].join(" ")}
        style={fillStyle}
      >
        {id === "custom" && (
          <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-bg bg-fg text-sm font-semibold text-bg">
            +
          </span>
        )}
      </span>
      {ACCENT_LABELS[id]}
    </button>
  );
}

/** "Внешний вид" tab (DESIGN-BRIEF §8.4) — presents `shared/theme/
 * appearance-store`'s controls (already fully wired, F1) in the
 * prototype's layout; every control here writes straight to the store, so
 * it applies live and survives a reload via its own persistence. */
export function AppearanceTab() {
  const theme = useAppearanceStore((state) => state.theme);
  const setTheme = useAppearanceStore((state) => state.setTheme);
  const accent = useAppearanceStore((state) => state.accent);
  const setAccent = useAppearanceStore((state) => state.setAccent);
  const font = useAppearanceStore((state) => state.font);
  const setFont = useAppearanceStore((state) => state.setFont);
  const scale = useAppearanceStore((state) => state.scale);
  const setScale = useAppearanceStore((state) => state.setScale);
  const bubble = useAppearanceStore((state) => state.bubble);
  const setBubble = useAppearanceStore((state) => state.setBubble);
  const decrypt = useAppearanceStore((state) => state.decrypt);
  const setDecrypt = useAppearanceStore((state) => state.setDecrypt);
  const customTheme = useAppearanceStore((state) => state.customTheme);
  const setCustomTheme = useAppearanceStore((state) => state.setCustomTheme);
  const customAccent = useAppearanceStore((state) => state.customAccent);
  const setCustomAccent = useAppearanceStore((state) => state.setCustomAccent);

  return (
    <div className="flex max-w-180 flex-col gap-9 px-14 pt-8 pb-16">
      <h1 className="m-0 text-[32px] font-medium tracking-tight">Внешний вид</h1>

      <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-bg2 p-5">
        <div className="mb-1 font-mono text-[11px] tracking-widest text-mute uppercase">
          Предпросмотр
        </div>
        <div className="max-w-[78%] self-start rounded-bubble border border-line bg-in px-3.5 py-2.5 text-msg leading-[1.45]">
          Встречаемся у библиотеки в семь?
        </div>
        <div className="max-w-[78%] self-end rounded-bubble [background:var(--color-accent)] px-3.5 py-2.5 text-msg leading-[1.45] text-ink shadow-glow">
          <Scramble text="Да, буду. Возьму ключи от зала." />
        </div>
        <span className="self-end font-mono text-[11px] text-accent-text">
          19:02 · ✓✓ прочитано
        </span>
      </div>

      <section className="flex flex-col gap-3.5">
        <div className="text-base font-medium">Тема</div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
          {THEME_IDS.map((id) => (
            <ThemeCard
              key={id}
              id={id}
              selected={theme === id}
              onSelect={() => {
                setTheme(id);
              }}
            />
          ))}
        </div>
      </section>

      {theme === "custom" && (
        <div className="-mt-4.5 flex flex-wrap items-center gap-5 rounded-[14px] border border-dashed border-line p-4">
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <span
              className="relative h-10 w-10 flex-none overflow-hidden rounded-xl border border-line"
              style={{ background: customTheme.bg }}
            >
              <input
                type="color"
                value={customTheme.bg}
                onChange={(e) => {
                  setCustomTheme({ bg: e.target.value });
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </span>
            <span className="flex flex-col gap-0.5">
              <span>Фон</span>
              <span className="font-mono text-xs text-mute uppercase">{customTheme.bg}</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <span
              className="relative h-10 w-10 flex-none overflow-hidden rounded-xl border border-line"
              style={{ background: customTheme.fg }}
            >
              <input
                type="color"
                value={customTheme.fg}
                onChange={(e) => {
                  setCustomTheme({ fg: e.target.value });
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </span>
            <span className="flex flex-col gap-0.5">
              <span>Текст</span>
              <span className="font-mono text-xs text-mute uppercase">{customTheme.fg}</span>
            </span>
          </label>
        </div>
      )}

      <section className="flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-base font-medium">Акцент</div>
          <span className="text-[13px] text-mute">Цвет или градиент</span>
        </div>
        <div className="flex flex-wrap gap-4.5">
          {ACCENT_IDS.map((id) => (
            <AccentSwatch
              key={id}
              id={id}
              selected={accent === id}
              onSelect={() => {
                setAccent(id);
              }}
            />
          ))}
        </div>
      </section>

      <div
        className={[
          "-mt-4.5 flex flex-wrap items-center gap-5 rounded-[14px] border p-4",
          accent === "custom" ? "border-line" : "border-dashed border-line",
        ].join(" ")}
      >
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <span
            className="relative h-10 w-10 flex-none overflow-hidden rounded-xl border border-line"
            style={{ background: customAccent.color1 }}
          >
            <input
              type="color"
              value={customAccent.color1}
              onChange={(e) => {
                setCustomAccent({ color1: e.target.value });
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>
          <span className="flex flex-col gap-0.5">
            <span>Цвет 1</span>
            <span className="font-mono text-xs text-mute uppercase">{customAccent.color1}</span>
          </span>
        </label>
        {customAccent.gradient && (
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <span
              className="relative h-10 w-10 flex-none overflow-hidden rounded-xl border border-line"
              style={{ background: customAccent.color2 }}
            >
              <input
                type="color"
                value={customAccent.color2}
                onChange={(e) => {
                  setCustomAccent({ color2: e.target.value });
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </span>
            <span className="flex flex-col gap-0.5">
              <span>Цвет 2</span>
              <span className="font-mono text-xs text-mute uppercase">{customAccent.color2}</span>
            </span>
          </label>
        )}
        <div
          onClick={() => {
            setCustomAccent({ gradient: !customAccent.gradient });
          }}
          className="ml-auto flex cursor-pointer items-center gap-2.5 text-sm"
        >
          Градиент
          <Toggle
            checked={customAccent.gradient}
            onChange={(gradient) => {
              setCustomAccent({ gradient });
            }}
            label="Градиент"
          />
        </div>
      </div>

      <section className="flex flex-col gap-3.5">
        <div className="text-base font-medium">Шрифт</div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
          {FONT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setFont(id);
              }}
              className="flex flex-col gap-1.5 rounded-[14px] border-2 p-3.5 text-left"
              style={{
                borderColor: font === id ? "var(--color-accent-text)" : "var(--color-line)",
                fontFamily: FONT_FAMILY[id],
              }}
            >
              <span className="text-[26px] leading-none">Аа</span>
              <span className="text-[13.5px] text-mute">{FONT_LABELS[id]}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-7">
        <section className="flex flex-col gap-3.5">
          <div className="text-base font-medium">Размер текста</div>
          <SegmentedTabs
            options={SCALE_IDS.map((id) => ({ value: id, label: SCALE_LABELS[id] }))}
            value={scale}
            onChange={setScale}
            fill
          />
        </section>
        <section className="flex flex-col gap-3.5">
          <div className="text-base font-medium">Форма сообщений</div>
          <SegmentedTabs
            options={BUBBLE_IDS.map((id) => ({ value: id, label: BUBBLE_LABELS[id] }))}
            value={bubble}
            onChange={setBubble}
            fill
          />
        </section>
      </div>

      <div
        onClick={() => {
          setDecrypt(!decrypt);
        }}
        className="flex cursor-pointer items-center justify-between gap-4 border-t border-line pt-6"
      >
        <span className="flex flex-col gap-1">
          <span className="text-base font-medium">Анимация появления</span>
          <span className="text-sm leading-[1.45] text-mute">
            Новые сообщения проявляются из шума
          </span>
        </span>
        <Toggle checked={decrypt} onChange={setDecrypt} label="Анимация появления" />
      </div>
    </div>
  );
}
