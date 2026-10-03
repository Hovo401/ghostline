import { createFileRoute } from "@tanstack/react-router";

import { isSettingsTab, Settings, type SettingsSearch } from "../../features/settings";

// Settings shell (DESIGN-BRIEF.md §7.3) — profile + appearance, reached from
// the chat list's settings button (header on phone, avatar footer on desktop
// — ChatListPanel.tsx). A child of the `/app` layout, not a sibling, so an
// ongoing call and the socket survive opening it (ADR 0016).
export const Route = createFileRoute("/app/settings")({
  // `?tab=` so a link can open a specific section (the chat list's
  // notifications banner → «Уведомления»), not always «Профиль».
  validateSearch: (search: Record<string, unknown>): SettingsSearch =>
    isSettingsTab(search.tab) ? { tab: search.tab } : {},
  component: Settings,
});
