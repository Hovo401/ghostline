import { useEffect } from "react";

import { resolveTheme, useAppearanceStore } from "./appearance-store";

/**
 * Keeps `<html data-theme data-accent>` in sync with the appearance store
 * — call once, near the app root. The very first paint is handled by the
 * inline script in index.html; this takes over for every change after
 * hydration (including the OS scheme flipping while `theme === "system"`).
 */
export function useApplyAppearance(): void {
  const theme = useAppearanceStore((state) => state.theme);
  const accent = useAppearanceStore((state) => state.accent);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolveTheme(theme));
    root.setAttribute("data-accent", accent);

    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => {
      root.setAttribute("data-theme", resolveTheme(theme));
    };
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [theme, accent]);
}
