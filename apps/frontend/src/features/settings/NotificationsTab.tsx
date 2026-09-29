import { useState } from "react";

import {
  useNotificationSettings,
  usePushSubscription,
  useUpdateNotificationSettings,
  type NotificationSettings,
} from "../../entities/notification";
import { Button } from "../../shared/ui/button";
import { Toggle } from "../../shared/ui/toggle";

const STATUS_LABEL: Record<ReturnType<typeof usePushSubscription>["status"], string> = {
  subscribed: "Включены",
  unsubscribed: "Выключены",
  denied: "Запрещены в браузере",
  unsupported: "Не поддерживаются этим браузером",
  pending: "Проверяем…",
};

/** `navigator.standalone` only exists on iOS Safari — checking it directly
 * against `false` both feature-detects (other browsers leave it
 * `undefined`, which fails the check) and answers "is this iOS Safari, not
 * yet installed to the Home Screen" in one go (DESIGN-BRIEF's iOS Push
 * caveat: Push only works from an installed PWA on iOS 16.4+). */
function isIosSafariNotInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === false;
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3.5 last:border-b-0">
      <span className="text-sm">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

/**
 * "Уведомления" settings tab (calls plan §Фаза 5, FR-NOTIF-05): permission
 * status + enable/disable, per-category toggles, a local test notification,
 * and the iOS "add to Home Screen" hint. Modeled on `AppearanceTab`'s
 * layout (card + sections in a scrollable column).
 *
 * "Отправить тестовое" fires a `Notification` straight from the page
 * rather than round-tripping through the backend — no `POST /notifications/
 * test`-style endpoint exists in this app's contract (`notification.schema.ts`
 * only has vapid-key/subscriptions/settings), and a real push round trip
 * isn't needed to prove permission + the OS notification UI actually work.
 */
export function NotificationsTab() {
  const { status, subscribe, unsubscribe } = usePushSubscription();
  const settings = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();
  const [testSent, setTestSent] = useState(false);

  const sendTestNotification = (): void => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    new Notification("Ghostline", { body: "Тестовое уведомление" });
    setTestSent(true);
  };

  const patch = (partial: Partial<NotificationSettings>): void => {
    updateSettings.mutate(partial);
  };

  return (
    <div className="flex max-w-180 flex-col gap-9 px-14 pt-8 pb-16">
      <h1 className="m-0 text-[32px] font-medium tracking-tight">Уведомления</h1>

      <section className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-bg2 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-base font-medium">Push-уведомления</span>
            <span className="text-sm text-mute">{STATUS_LABEL[status]}</span>
          </div>
          {status === "unsubscribed" && (
            <Button
              onClick={() => {
                void subscribe();
              }}
            >
              Включить уведомления
            </Button>
          )}
          {status === "subscribed" && (
            <Button
              variant="secondary"
              onClick={() => {
                void unsubscribe();
              }}
            >
              Отключить
            </Button>
          )}
        </div>
        {isIosSafariNotInstalled() && (
          <p className="text-sm text-mute">
            Установите на экран «Домой» для уведомлений — на iPhone/iPad push работает только из
            установленного приложения.
          </p>
        )}
      </section>

      {settings.data && (
        <section className="flex flex-col overflow-hidden rounded-[18px] border border-line">
          <ToggleRow
            label="Сообщения"
            checked={settings.data.messages}
            onChange={(messages) => {
              patch({ messages });
            }}
          />
          <ToggleRow
            label="Звонки"
            checked={settings.data.calls}
            onChange={(calls) => {
              patch({ calls });
            }}
          />
          <ToggleRow
            label="Показывать текст сообщения"
            checked={settings.data.preview}
            onChange={(preview) => {
              patch({ preview });
            }}
          />
        </section>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          disabled={status !== "subscribed"}
          onClick={sendTestNotification}
        >
          Отправить тестовое
        </Button>
        {testSent && <span className="text-sm text-mute">Отправлено</span>}
      </div>
    </div>
  );
}
