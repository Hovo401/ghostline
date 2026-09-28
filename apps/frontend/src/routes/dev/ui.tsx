import { createFileRoute } from "@tanstack/react-router";

import { THEME_IDS, useAppearanceStore } from "../../shared/theme/appearance-store";

/**
 * Component/theme showcase (DESIGN-BRIEF.md §8.3/§11 DR-19 — "витрина
 * `/dev/themes`"). Every shared UI component gets a swatch here as it's
 * built, so a theme/token change is checked in one place instead of
 * clicking through the whole app. Not part of the shipped `/app` bundle
 * boundary-wise, but not excluded from the build here either — that split
 * is a follow-up once there's more than a theme switcher to gate.
 */
export const Route = createFileRoute("/dev/ui")({
  component: DevUiPage,
});

function DevUiPage() {
  const theme = useAppearanceStore((state) => state.theme);
  const setTheme = useAppearanceStore((state) => state.setTheme);

  return (
    <main className="min-h-screen bg-bg p-8 text-fg">
      <h1 className="mb-6 font-mono text-xs uppercase tracking-widest text-mute">
        /dev/ui — витрина
      </h1>

      <section className="mb-8 flex gap-2">
        {THEME_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTheme(id);
            }}
            className="rounded-lg border border-line px-4 py-2 text-sm"
            aria-pressed={theme === id}
          >
            {id}
          </button>
        ))}
      </section>

      <section className="flex flex-wrap gap-4">
        <div className="rounded-2xl bg-in px-4 py-3 text-sm">Входящее сообщение</div>
        <div className="rounded-2xl bg-accent px-4 py-3 text-sm text-ink">Своё сообщение</div>
        <div className="rounded-xl border border-line bg-panel px-4 py-3 text-sm">Panel</div>
      </section>
    </main>
  );
}
