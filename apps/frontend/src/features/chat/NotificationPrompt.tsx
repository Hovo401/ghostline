import { useNotificationBannerStore, usePushSubscription } from "../../entities/notification";
import { Backdrop } from "../../shared/ui/backdrop";
import { Button } from "../../shared/ui/button";

/**
 * First-open "allow notifications?" dialog (FR-NOTIF-04) — asked once per
 * device, the first time the messenger opens with notifications off. It's
 * our own dialog first, not the browser's prompt straight away: Firefox and
 * Safari only show `Notification.requestPermission()` from a click, Chrome
 * demotes on-load prompts to a quiet address-bar icon, and a "Block" in the
 * native prompt can never be asked again — so the native prompt only runs
 * from «Разрешить», where the user has already said yes once. Declining
 * here (button, backdrop, Back) is what makes the chat list's
 * `NotificationInviteBanner` appear instead.
 */
export function NotificationPrompt() {
  const { status, subscribe } = usePushSubscription();
  const promptSeen = useNotificationBannerStore((state) => state.promptSeen);
  const markPromptSeen = useNotificationBannerStore((state) => state.markPromptSeen);

  if (promptSeen || status !== "unsubscribed") return null;

  return (
    <>
      <Backdrop open onClose={markPromptSeen} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Уведомления"
        className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border border-line bg-panel p-5 shadow-glow"
      >
        <span className="text-base font-medium">Разрешить уведомления?</span>
        <p className="m-0 text-sm text-mute">
          Чтобы не пропускать сообщения и звонки, когда Ghostline свёрнут или закрыт.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={markPromptSeen}>
            Не сейчас
          </Button>
          <Button
            onClick={() => {
              markPromptSeen();
              void subscribe();
            }}
          >
            Разрешить
          </Button>
        </div>
      </div>
    </>
  );
}
