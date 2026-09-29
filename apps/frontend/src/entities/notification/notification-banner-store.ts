import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * One-time, dismissible "enable notifications" invite banner in the chat
 * list (calls plan §Фаза 5, nice-to-have) — persisted the same way
 * `shared/theme/appearance-store.ts` persists its settings, so a dismissal
 * survives a reload instead of nagging again on every visit.
 */
interface NotificationBannerState {
  dismissed: boolean;
  dismiss: () => void;
}

export const NOTIFICATION_BANNER_STORAGE_KEY = "ghostline:notification-banner";

export const useNotificationBannerStore = create<NotificationBannerState>()(
  persist(
    (set) => ({
      dismissed: false,
      dismiss: () => {
        set({ dismissed: true });
      },
    }),
    { name: NOTIFICATION_BANNER_STORAGE_KEY },
  ),
);
