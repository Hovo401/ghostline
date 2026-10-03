import { Link } from "@tanstack/react-router";

import { useNotificationBannerStore, usePushSubscription } from "../../entities/notification";

/**
 * Dismissible fallback nudge in the chat list — appears only once the
 * first-open `NotificationPrompt` was declined (persisted, see
 * `notification-banner-store`) and notifications are still off:
 * - not enabled yet → «Включить» asks the browser right here (a click is the
 *   user gesture `Notification.requestPermission()` needs);
 * - blocked in the browser → it can't be re-asked from the page at all, so
 *   «Как включить» opens Settings → Уведомления, whose platform hint says
 *   where to allow it.
 */
export function NotificationInviteBanner() {
  const { status, subscribe } = usePushSubscription();
  const promptSeen = useNotificationBannerStore((state) => state.promptSeen);
  const dismissed = useNotificationBannerStore((state) => state.dismissed);
  const dismiss = useNotificationBannerStore((state) => state.dismiss);

  if (!promptSeen || dismissed) return null;
  if (status !== "unsubscribed" && status !== "denied") return null;

  return (
    <div className="mx-2.5 mb-2 flex items-center justify-between gap-3 rounded-xl border border-line bg-bg2 px-3.5 py-3 text-sm">
      <span className="min-w-0 flex-1">
        {status === "denied"
          ? "Уведомления запрещены в браузере"
          : "Включить уведомления о сообщениях и звонках?"}
      </span>
      <div className="flex flex-none items-center gap-2">
        {status === "denied" ? (
          <Link
            to="/app/settings"
            search={{ tab: "notifications" }}
            state={{ inAppBack: true }}
            className="text-xs text-accent-text underline"
          >
            Как включить
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              void subscribe();
            }}
            className="text-xs text-accent-text underline"
          >
            Включить
          </button>
        )}
        <button type="button" onClick={dismiss} aria-label="Скрыть" className="text-xs text-mute">
          ✕
        </button>
      </div>
    </div>
  );
}
