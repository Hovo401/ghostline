import { useState } from "react";

import {
  useNotificationSettings,
  sendTestPush,
  usePushSubscription,
  useUpdateNotificationSettings,
  type NotificationSettings,
} from "../../entities/notification";
import { Button } from "../../shared/ui/button";
import { Toggle } from "../../shared/ui/toggle";

import { detectPlatformHint, isStandaloneDisplay } from "./platform-hint";

const STATUS_LABEL: Record<ReturnType<typeof usePushSubscription>["status"], string> = {
  subscribed: "Включены",
  unsubscribed: "Выключены",
  denied: "Запрещены в браузере",
  unsupported: "Не поддерживаются этим браузером",
  pending: "Проверяем…",
};

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
 * "Отправить тестовое" goes through `POST /notifications/test` — a real
 * push, so it fails exactly when real notifications would (a stale server
 * subscription, a rotated VAPID key). A page-local `new Notification()`
 * proved only the permission, and throws outright on Android Chrome.
 */
export function NotificationsTab() {
  const { status, subscribe, unsubscribe } = usePushSubscription();
  const settings = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();
  const [testState, setTestState] = useState<"idle" | "sent" | "failed">("idle");

  const sendTestNotification = (): void => {
    sendTestPush().then(
      () => {
        setTestState("sent");
      },
      () => {
        setTestState("failed");
      },
    );
  };

  const patch = (partial: Partial<NotificationSettings>): void => {
    updateSettings.mutate(partial);
  };

  const platformHint =
    status !== "unsupported" && status !== "denied"
      ? detectPlatformHint(navigator.userAgent, isStandaloneDisplay())
      : null;

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
        {platformHint && <p className="text-sm text-mute">{platformHint.text}</p>}
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
        {testState === "sent" && <span className="text-sm text-mute">Отправлено</span>}
        {testState === "failed" && <span className="text-sm text-mute">Не удалось отправить</span>}
      </div>
    </div>
  );
}
