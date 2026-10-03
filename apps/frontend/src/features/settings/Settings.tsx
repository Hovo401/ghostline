import { getRouteApi } from "@tanstack/react-router";

import { useInAppBack } from "../../shared/lib/use-in-app-back";
import { SegmentedTabs } from "../../shared/ui/segmented-tabs";

import { AppearanceTab } from "./AppearanceTab";
import { LogoutButton } from "./LogoutButton";
import { NotificationsTab } from "./NotificationsTab";
import { ProfileTab } from "./ProfileTab";
import { SETTINGS_TABS, type SettingsTab } from "./settings-tabs";

const settingsRoute = getRouteApi("/app/settings");

/**
 * `onSettings` screen (DESIGN-BRIEF.md §7.3): desktop back arrow + section list,
 * phone back arrow + segmented tabs, ported from
 * docs/design/prototype/Ghostline.dc.html's `data-screen-label="Настройки ·
 * Внешний вид"` block. "Профиль", "Внешний вид" and "Уведомления" ship —
 * the prototype's remaining section labels
 * (Конфиденциальность/Устройства/О приложении) are BACKLOG.md M6
 * ("remaining settings sections").
 */
export function Settings() {
  // The section lives in `?tab=` so links can deep-link into it; switching
  // replaces rather than pushes — sections aren't steps Back should walk.
  const tab = settingsRoute.useSearch({ select: (search) => search.tab }) ?? "profile";
  const navigate = settingsRoute.useNavigate();
  const setTab = (next: SettingsTab): void => {
    void navigate({ search: { tab: next }, replace: true });
  };
  const goBack = useInAppBack();

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-fg">
      <div className="hidden w-65 flex-none flex-col gap-0.5 border-r border-line px-3 py-5.5 md:flex">
        <div className="flex items-center gap-1 pb-4">
          <button
            type="button"
            onClick={goBack}
            aria-label="Назад к чатам"
            title="Назад к чатам"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-xl hover:bg-bg2"
          >
            {"←"}
          </button>
          <span className="text-2xl font-medium tracking-tight">Настройки</span>
        </div>
        {SETTINGS_TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setTab(item.value);
            }}
            className={[
              "h-10.5 rounded-xl px-3 text-left text-[14.5px]",
              tab === item.value ? "bg-bg2 text-fg" : "text-mute",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
        <LogoutButton className="mt-auto" />
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex h-14 items-center gap-1.5 border-b border-line px-2.5 md:hidden">
          <button
            type="button"
            onClick={goBack}
            aria-label="Назад"
            className="flex h-11 w-11 items-center justify-center text-xl"
          >
            {"←"}
          </button>
          <span className="text-[15px] text-mute">Настройки</span>
        </div>
        <div className="px-14 pt-4 md:hidden">
          <SegmentedTabs options={SETTINGS_TABS} value={tab} onChange={setTab} fill />
        </div>

        {tab === "profile" && <ProfileTab />}
        {tab === "appearance" && <AppearanceTab />}
        {tab === "notifications" && <NotificationsTab />}

        <div className="border-t border-line px-11 py-4 md:hidden">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
