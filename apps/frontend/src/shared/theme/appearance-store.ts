import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CustomAccentColors, CustomThemeColors } from "./apply-custom-appearance";
import { toneFromBackground } from "./color-utils";

/** Appearance axes — DESIGN-BRIEF.md §8.1. Independent: any theme × any
 * accent × any font. Adding a built-in theme/accent is one file under
 * `src/themes/` plus one id here (§8.3) — no component changes. */
export const THEME_IDS = [
  "dark",
  "light",
  "system",
  "midnight",
  "paper",
  "terminal",
  "custom",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export type ResolvedThemeId = Exclude<ThemeId, "system">;

export const ACCENT_IDS = [
  "signal",
  "ion",
  "ember",
  "violet",
  "aurora",
  "sunset",
  "mint",
  "custom",
] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

export const FONT_IDS = ["sans", "mono", "pixel", "serif"] as const;
export type FontId = (typeof FONT_IDS)[number];

export const SCALE_IDS = ["s", "m", "l"] as const;
export type ScaleId = (typeof SCALE_IDS)[number];

export const BUBBLE_IDS = ["round", "sharp"] as const;
export type BubbleId = (typeof BUBBLE_IDS)[number];

export type Tone = "light" | "dark";

export const APPEARANCE_STORAGE_KEY = "ghostline:appearance";

/** Tone of each built-in theme — decides which `--gl-accent-text` variant
 * an accent uses (DESIGN-BRIEF §8.2). `custom` has none: its tone is
 * computed from the picked background's luminance instead. */
const THEME_TONE: Record<Exclude<ResolvedThemeId, "custom">, Tone> = {
  dark: "dark",
  light: "light",
  midnight: "dark",
  paper: "light",
  terminal: "dark",
};

const DEFAULT_CUSTOM_THEME: CustomThemeColors = { bg: "#1a1030", fg: "#f2ecff" };
const DEFAULT_CUSTOM_ACCENT: CustomAccentColors = {
  color1: "#ff5fa2",
  color2: "#7c5cff",
  gradient: true,
};

interface AppearanceState {
  theme: ThemeId;
  accent: AccentId;
  font: FontId;
  scale: ScaleId;
  bubble: BubbleId;
  /** "Decrypt"/scramble-in animation — DESIGN-BRIEF §5/§8.1. */
  decrypt: boolean;
  customTheme: CustomThemeColors;
  customAccent: CustomAccentColors;
  setTheme: (theme: ThemeId) => void;
  setAccent: (accent: AccentId) => void;
  setFont: (font: FontId) => void;
  setScale: (scale: ScaleId) => void;
  setBubble: (bubble: BubbleId) => void;
  setDecrypt: (decrypt: boolean) => void;
  setCustomTheme: (colors: Partial<CustomThemeColors>) => void;
  setCustomAccent: (colors: Partial<CustomAccentColors>) => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: "dark",
      accent: "signal",
      font: "sans",
      scale: "m",
      bubble: "round",
      decrypt: true,
      customTheme: DEFAULT_CUSTOM_THEME,
      customAccent: DEFAULT_CUSTOM_ACCENT,
      setTheme: (theme) => {
        set({ theme });
      },
      setAccent: (accent) => {
        set({ accent });
      },
      setFont: (font) => {
        set({ font });
      },
      setScale: (scale) => {
        set({ scale });
      },
      setBubble: (bubble) => {
        set({ bubble });
      },
      setDecrypt: (decrypt) => {
        set({ decrypt });
      },
      setCustomTheme: (colors) => {
        set((state) => ({ customTheme: { ...state.customTheme, ...colors } }));
      },
      setCustomAccent: (colors) => {
        set((state) => ({ customAccent: { ...state.customAccent, ...colors } }));
      },
    }),
    { name: APPEARANCE_STORAGE_KEY },
  ),
);

/** Mirrors the inline script in index.html — keep both in sync. */
export function resolveTheme(theme: ThemeId): ResolvedThemeId {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Resolves `data-tone` for the active (already-resolved) theme —
 * DESIGN-BRIEF §2.2/§8.2. */
export function resolveTone(resolvedTheme: ResolvedThemeId, customBg: string): Tone {
  if (resolvedTheme === "custom") return toneFromBackground(customBg);
  return THEME_TONE[resolvedTheme];
}

/** Appearance "decrypt" animation is on only if the user hasn't turned it
 * off *and* the OS isn't asking for reduced motion — DESIGN-BRIEF §8.1/§9. */
export function resolveMotionEnabled(decrypt: boolean): boolean {
  if (!decrypt) return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
