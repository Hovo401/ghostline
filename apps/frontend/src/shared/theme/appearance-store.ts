import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Ghostline's appearance axes — DESIGN-BRIEF.md §8.1. This scaffold wires
 * up `theme` (dark/light/system) and `accent` (signal only so far); the
 * remaining axes (font, text scale, bubble shape, motion) plug into this
 * same store + `theme.css` mapping pattern when their features land.
 */
export const THEME_IDS = ["dark", "light", "system"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export type ResolvedThemeId = Exclude<ThemeId, "system">;

export const ACCENT_IDS = ["signal"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

export const APPEARANCE_STORAGE_KEY = "ghostline:appearance";

interface AppearanceState {
  theme: ThemeId;
  accent: AccentId;
  setTheme: (theme: ThemeId) => void;
  setAccent: (accent: AccentId) => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: "dark",
      accent: "signal",
      setTheme: (theme) => {
        set({ theme });
      },
      setAccent: (accent) => {
        set({ accent });
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
