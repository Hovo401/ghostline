/** Settings sections, in display order — also the values `/app/settings?tab=` accepts. */
export const SETTINGS_TABS = [
  { value: "profile", label: "Профиль" },
  { value: "appearance", label: "Внешний вид" },
  { value: "notifications", label: "Уведомления" },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]["value"];

export interface SettingsSearch {
  tab?: SettingsTab;
}

export function isSettingsTab(value: unknown): value is SettingsTab {
  return SETTINGS_TABS.some((item) => item.value === value);
}
