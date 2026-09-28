---
name: new-theme
description: Add a new visual theme to the frontend. Use when a task asks for a new theme (matching DESIGN-BRIEF.md's theme list, or a user-requested custom one) — never by editing a component to special-case a color.
---

1. `pnpm gen theme <kebab-case-id>` — creates `apps/frontend/src/themes/<id>.css` with a token
   skeleton, and auto-adds the `@import` to `shared/theme/theme.css`.
2. Fill in every `--gl-*` value from the theme's spec (DESIGN-BRIEF.md §2.2 has the reference
   Dark/Light values; §8.3 has the full contract). If it's a new accent rather than a full
   theme, follow the same pattern in a `themes/accent-<id>.css` file instead (see
   `themes/accent-signal.css`).
3. Add the id to `THEME_IDS` (or `ACCENT_IDS`) in `apps/frontend/src/shared/theme/appearance-store.ts`.
4. Add a swatch/toggle for it on `/dev/ui` (`apps/frontend/src/routes/dev/ui.tsx`) so it's
   checkable without clicking through the whole app.
5. Check contrast: `fg`/`bg` ≥ 4.5:1, `mute`/`bg` ≥ 3:1 (DESIGN-BRIEF.md §10). If this theme
   introduces effects beyond color (glow, a different avatar shape, …), that's a token/contract
   addition to `theme.css`'s `@theme` mapping — not a per-component `if (theme === ...)` branch.
   If you find yourself writing that branch, the contract is missing something; extend it there.
6. Verify: open `/dev/ui`, switch to the new theme, confirm nothing else changed unexpectedly.
