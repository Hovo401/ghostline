import { useState } from "react";

import { IOS_INSTALL_HINT, usePwaInstall, usePwaInstallStore } from "../../shared/lib/pwa-install";

/**
 * Dismissible "install as an app" nudge at the top of the chat list — an
 * installed PWA gets its own window/icon and (on iOS) is the only way to
 * receive pushes at all (FR-NOTIF-04). Renders only where installing is
 * possible and hasn't happened yet (`usePwaInstall`); Chromium opens its
 * own install dialog, iOS Safari has no API, so the button reveals the
 * manual "Поделиться → На экран «Домой»" steps instead.
 */
export function InstallAppBanner() {
  const { mode, install } = usePwaInstall();
  const dismissed = usePwaInstallStore((state) => state.bannerDismissed);
  const dismiss = usePwaInstallStore((state) => state.dismissBanner);
  const [showIosHint, setShowIosHint] = useState(false);

  if (dismissed || mode === null) return null;

  return (
    <div className="mx-2.5 mb-2 flex flex-col gap-2 rounded-xl border border-line bg-bg2 px-3.5 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1">Установить Ghostline как приложение?</span>
        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (mode === "prompt") void install();
              else setShowIosHint(true);
            }}
            className="text-xs text-accent-text underline"
          >
            Установить
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Скрыть предложение установить"
            className="text-xs text-mute"
          >
            ✕
          </button>
        </div>
      </div>
      {showIosHint && <p className="text-xs text-mute">{IOS_INSTALL_HINT}</p>}
    </div>
  );
}
