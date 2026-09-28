import { useEffect } from "react";

import { resolveTheme, resolveTone, useAppearanceStore } from "./appearance-store";
import { applyCustomAccent, applyCustomTheme } from "./apply-custom-appearance";

/**
 * Keeps `<html data-theme data-tone data-accent data-font data-scale
 * data-bubble>` in sync with the appearance store — call once, near the app
 * root. The very first paint is handled by the inline script in
 * index.html; this takes over for every change after hydration (including
 * the OS scheme flipping while `theme === "system"`, and regenerating the
 * `custom` theme/accent `<style>` tags when their colors change).
 */
export function useApplyAppearance(): void {
  const theme = useAppearanceStore((state) => state.theme);
  const accent = useAppearanceStore((state) => state.accent);
  const font = useAppearanceStore((state) => state.font);
  const scale = useAppearanceStore((state) => state.scale);
  const bubble = useAppearanceStore((state) => state.bubble);
  const customTheme = useAppearanceStore((state) => state.customTheme);
  const customAccent = useAppearanceStore((state) => state.customAccent);

  useEffect(() => {
    if (theme === "custom") applyCustomTheme(customTheme);
  }, [theme, customTheme]);

  useEffect(() => {
    if (accent === "custom") applyCustomAccent(customAccent);
  }, [accent, customAccent]);

  useEffect(() => {
    const root = document.documentElement;
    const apply = (): void => {
      const resolved = resolveTheme(theme);
      root.setAttribute("data-theme", resolved);
      root.setAttribute("data-tone", resolveTone(resolved, customTheme.bg));
    };
    apply();

    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
    };
  }, [theme, customTheme.bg]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute("data-font", font);
  }, [font]);

  useEffect(() => {
    document.documentElement.setAttribute("data-scale", scale);
  }, [scale]);

  useEffect(() => {
    document.documentElement.setAttribute("data-bubble", bubble);
  }, [bubble]);
}
