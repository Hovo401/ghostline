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
 *
 * `usePrefs = false` (public pages — landing, login/register) applies the
 * defaults instead: appearance settings only style the app itself.
 */
export function useApplyAppearance(usePrefs = true): void {
  const store = useAppearanceStore();
  const theme = usePrefs ? store.theme : "dark";
  const accent = usePrefs ? store.accent : "signal";
  const font = usePrefs ? store.font : "sans";
  const scale = usePrefs ? store.scale : "m";
  const bubble = usePrefs ? store.bubble : "round";
  const { customTheme, customAccent } = store;

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
