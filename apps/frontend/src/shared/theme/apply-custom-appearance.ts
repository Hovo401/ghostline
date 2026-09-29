import { inkFor } from "./color-utils";

/**
 * `custom` theme/accent aren't files under `src/themes/` — DESIGN-BRIEF.md
 * §2.2/§2.3/§8.2 generate them at runtime from the user's picked colors,
 * mixed in OKLab via CSS `color-mix()` (browser does the color math, same
 * approach as the prototype's `applyCustom()`). This writes one `<style>`
 * tag per axis so `[data-theme="custom"]`/`[data-accent="custom"]` resolve
 * exactly like any other theme/accent file.
 */

export interface CustomThemeColors {
  bg: string;
  fg: string;
}

export interface CustomAccentColors {
  color1: string;
  color2: string;
  gradient: boolean;
}

const THEME_STYLE_ID = "gl-custom-theme";
const ACCENT_STYLE_ID = "gl-custom-accent";

function ensureStyleTag(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}

function setIfChanged(el: HTMLStyleElement, css: string): void {
  if (el.textContent !== css) el.textContent = css;
}

export function applyCustomTheme({ bg, fg }: CustomThemeColors): void {
  const mix = (pct: number) => `color-mix(in oklab, ${bg} ${String(pct)}%, ${fg})`;
  const css = `[data-theme="custom"]{--gl-bg:${bg};--gl-bg2:${mix(94)};--gl-panel:${mix(90)};--gl-line:${mix(80)};--gl-fg:${fg};--gl-mute:${mix(40)};--gl-in:${mix(88)};--gl-desk:color-mix(in oklab, ${bg} 70%, #000);--gl-glyph-a:.3}`;
  setIfChanged(ensureStyleTag(THEME_STYLE_ID), css);
}

export function applyCustomAccent({ color1, color2, gradient }: CustomAccentColors): void {
  const fill = gradient ? `linear-gradient(135deg, ${color1}, ${color2})` : color1;
  const ink = inkFor(color1);
  const css = `[data-accent="custom"]{--gl-accent-fill:${fill};--gl-accent-text:${color1};--gl-ink:${ink}}`;
  setIfChanged(ensureStyleTag(ACCENT_STYLE_ID), css);
}
