import { useState } from "react";

import { useAndroidUpdate } from "../../shared/native";

/**
 * "New version" nudge inside the Android app (FR-APP-01). The link is a plain APK download —
 * the shell hands it to the system installer. Below `minVersionCode` it can't be dismissed.
 */
export function AppUpdateBanner() {
  const update = useAndroidUpdate();
  const [dismissed, setDismissed] = useState(false);

  if (update.status === "none") return null;
  if (update.status === "available" && dismissed) return null;

  return (
    <div className="mx-2.5 mb-2 flex items-center justify-between gap-3 rounded-xl border border-line bg-bg2 px-3.5 py-3 text-sm">
      <span className="min-w-0 flex-1">
        {update.status === "required"
          ? `Нужно обновить Ghostline до ${update.release.versionName}.`
          : `Доступна новая версия Ghostline ${update.release.versionName}.`}
      </span>
      <div className="flex flex-none items-center gap-2">
        <a href={update.release.url} download className="text-xs text-accent-text underline">
          Обновить
        </a>
        {update.status === "available" && (
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
            }}
            aria-label="Скрыть предложение обновить"
            className="text-xs text-mute"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
