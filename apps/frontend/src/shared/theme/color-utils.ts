/**
 * Small color-math helpers for the `custom` theme/accent (DESIGN-BRIEF.md
 * §2.2/§2.3) — ported from the prototype's `applyCustom()` (`lum`, `ink`
 * picks). Everything else about custom colors (mixing bg2/panel/line/mute
 * from the two picked colors) is delegated to CSS `color-mix(in oklab, …)`
 * at apply time, same as the prototype — no need to reimplement OKLab here.
 */

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Normalizes `#abc` to `#aabbcc`; returns the input unchanged otherwise. */
export function normalizeHex(hex: string): string {
  if (/^#([0-9a-fA-F]{3})$/.test(hex)) {
    return `#${hex
      .slice(1)
      .split("")
      .map((c) => c + c)
      .join("")}`;
  }
  return hex;
}

export function isValidHex(hex: string): boolean {
  return HEX_RE.test(hex);
}

/** Relative luminance (0–1) by the same fast weighting the prototype uses. */
export function luminance(hex: string): number {
  const normalized = normalizeHex(hex);
  const n = Number.parseInt(normalized.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Which theme tone a background color reads as — DESIGN-BRIEF §2.2. */
export function toneFromBackground(bg: string): "light" | "dark" {
  return luminance(bg) > 0.55 ? "light" : "dark";
}

/** Text-on-fill color for a custom accent — DESIGN-BRIEF §2.3 `ink`. */
export function inkFor(accentColor: string): "#0b0d0c" | "#ffffff" {
  return luminance(accentColor) > 0.55 ? "#0b0d0c" : "#ffffff";
}
