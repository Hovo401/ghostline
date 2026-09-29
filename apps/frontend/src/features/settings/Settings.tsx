import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { SegmentedTabs } from "../../shared/ui/segmented-tabs";

import { AppearanceTab } from "./AppearanceTab";
import { NotificationsTab } from "./NotificationsTab";
import { ProfileTab } from "./ProfileTab";

const SETTINGS_TABS = [
  { value: "profile", label: "Профиль" },
  { value: "appearance", label: "Внешний вид" },
  { value: "notifications", label: "Уведомления" },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]["value"];

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
  const [tab, setTab] = useState<SettingsTab>("profile");

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-fg">
      <div className="hidden w-65 flex-none flex-col gap-0.5 border-r border-line px-3 py-5.5 md:flex">
        <div className="flex items-center gap-1 pb-4">
          <Link
            to="/app"
            aria-label="Назад к чатам"
            title="Назад к чатам"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-xl hover:bg-bg2"
          >
            {"←"}
          </Link>
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
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex h-14 items-center gap-1.5 border-b border-line px-2.5 md:hidden">
          <Link
            to="/app"
            aria-label="Назад"
            className="flex h-11 w-11 items-center justify-center text-xl"
          >
            {"←"}
          </Link>
          <span className="text-[15px] text-mute">Настройки</span>
        </div>
        <div className="px-14 pt-4 md:hidden">
          <SegmentedTabs options={SETTINGS_TABS} value={tab} onChange={setTab} fill />
        </div>

        {tab === "profile" && <ProfileTab />}
        {tab === "appearance" && <AppearanceTab />}
        {tab === "notifications" && <NotificationsTab />}
      </div>
    </div>
  );
}
