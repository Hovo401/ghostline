import type {
  AccentId,
  BubbleId,
  FontId,
  ScaleId,
  ThemeId,
} from "../../shared/theme/appearance-store";

/**
 * Copy/labels for the "Внешний вид" tab's cards (DESIGN-BRIEF §8.4), ported
 * from the prototype's `themeCards`/`accents`/`fonts`/`scaleTabs`/
 * `bubbleTabs` arrays. No colors here — a card's *preview* swatch renders
 * with the real `data-theme`/`data-accent` tokens (`ThemeCard`/
 * `AccentSwatch` in AppearanceTab.tsx), not a hardcoded hex per id, so a new
 * theme/accent only needs an entry here, never a color literal.
 */
export const THEME_LABELS: Record<ThemeId, string> = {
  dark: "Тёмная",
  light: "Светлая",
  system: "Как в системе",
  midnight: "Полночь",
  paper: "Бумага",
  terminal: "Терминал",
  custom: "Своя",
};

export const ACCENT_LABELS: Record<AccentId, string> = {
  signal: "Сигнал",
  ion: "Ион",
  ember: "Искра",
  violet: "Фиалка",
  aurora: "Аврора",
  sunset: "Закат",
  mint: "Мята",
  custom: "Свой",
};

export const FONT_LABELS: Record<FontId, string> = {
  sans: "Геологика",
  mono: "Моно",
  pixel: "Пиксель",
  serif: "Антиква",
};

/** `font-family` CSS value per axis option — same values `theme.css`'s
 * `[data-font]` block maps `--gl-font` to, needed here only because a font
 * card previews its own family on "Аа" before it's selected. */
export const FONT_FAMILY: Record<FontId, string> = {
  sans: "Geologica, sans-serif",
  mono: "'JetBrains Mono', monospace",
  pixel: "'Pixelify Sans', sans-serif",
  serif: "'PT Serif', serif",
};

export const SCALE_LABELS: Record<ScaleId, string> = {
  s: "Мельче",
  m: "Обычный",
  l: "Крупнее",
};

export const BUBBLE_LABELS: Record<BubbleId, string> = {
  round: "Скруглённые",
  sharp: "Строгие",
};
