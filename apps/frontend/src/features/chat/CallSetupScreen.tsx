import {
  isNativeSetupComplete,
  NativePermissionChecklist,
  useNotificationBannerStore,
} from "../../entities/notification";
import { useNativePermissions } from "../../shared/native";
import { Backdrop } from "../../shared/ui/backdrop";
import { Button } from "../../shared/ui/button";

import { NotificationPrompt } from "./NotificationPrompt";

/**
 * First-run "Чтобы не пропускать звонки" (FR-APP-07) in the Android app: one dialog, once, listing
 * the phone settings that decide whether a message or call gets through with the app closed. It
 * replaces `NotificationPrompt` there (the checklist's first row asks for the same permission).
 * Only when something is still off — a phone that is already set up never sees it. An APK older
 * than T-084 (no checklist to read) keeps `NotificationPrompt`.
 */
export function CallSetupScreen() {
  const status = useNativePermissions();
  const setupSeen = useNotificationBannerStore((state) => state.setupSeen);
  const markSetupSeen = useNotificationBannerStore((state) => state.markSetupSeen);

  // Loading: show nothing rather than flash the plain prompt first.
  if (status === undefined) return null;
  if (status === null) return <NotificationPrompt />;
  if (setupSeen || isNativeSetupComplete(status)) return null;

  return (
    <>
      <Backdrop open onClose={markSetupSeen} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Чтобы не пропускать звонки"
        className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-glow"
      >
        <span className="text-base font-medium">Чтобы не пропускать звонки</span>
        <p className="m-0 text-sm text-mute">
          Телефон может не разбудить вас звонком, пока эти настройки выключены. Их можно изменить
          позже в Настройки → Уведомления.
        </p>
        <NativePermissionChecklist status={status} />
        <div className="flex justify-end">
          <Button onClick={markSetupSeen}>Готово</Button>
        </div>
      </div>
    </>
  );
}
