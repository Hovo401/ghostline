import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Per-device memory of the notification nudges — persisted the same way
 * `shared/theme/appearance-store.ts` persists its settings, so neither
 * nags again on every visit:
 * - `promptSeen` — the first-open "Разрешить уведомления?" dialog
 *   (`features/chat/NotificationPrompt`) was answered either way;
 * - `dismissed` — the chat list's fallback "Включить уведомления" banner,
 *   shown only after that dialog was declined, was closed with ✕.
 */
interface NotificationBannerState {
  promptSeen: boolean;
  dismissed: boolean;
  markPromptSeen: () => void;
  dismiss: () => void;
}

export const NOTIFICATION_BANNER_STORAGE_KEY = "ghostline:notification-banner";

export const useNotificationBannerStore = create<NotificationBannerState>()(
  persist(
    (set) => ({
      promptSeen: false,
      dismissed: false,
      markPromptSeen: () => {
        set({ promptSeen: true });
      },
      dismiss: () => {
        set({ dismissed: true });
      },
    }),
    { name: NOTIFICATION_BANNER_STORAGE_KEY },
  ),
);
