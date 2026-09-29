import { Link } from "@tanstack/react-router";

import { useNotificationBannerStore, usePushSubscription } from "../../entities/notification";

/**
 * One-time, dismissible nudge to enable Web Push (calls plan §Фаза 5,
 * nice-to-have) — shown in the chat list once a device isn't subscribed yet
 * and hasn't dismissed it before (persisted, see `notification-banner-store`).
 * Actually enabling notifications happens from `NotificationsTab` (a
 * `Notification.requestPermission()` prompt needs a real settings-screen
 * button, not a passive banner) — this just points there.
 */
export function NotificationInviteBanner() {
  const { status } = usePushSubscription();
  const dismissed = useNotificationBannerStore((state) => state.dismissed);
  const dismiss = useNotificationBannerStore((state) => state.dismiss);

  if (dismissed || status !== "unsubscribed") return null;

  return (
    <div className="mx-2.5 mb-2 flex items-center justify-between gap-3 rounded-xl border border-line bg-bg2 px-3.5 py-3 text-sm">
      <span className="min-w-0 flex-1">Включить уведомления о сообщениях и звонках?</span>
      <div className="flex flex-none items-center gap-2">
        <Link to="/settings" className="text-xs text-accent-text underline">
          Включить
        </Link>
        <button type="button" onClick={dismiss} aria-label="Скрыть" className="text-xs text-mute">
          ✕
        </button>
      </div>
    </div>
  );
}
