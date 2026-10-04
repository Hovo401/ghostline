import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  NATIVE_PERMISSIONS_KEY,
  openSystemSettings,
  type NativePermissionStatus,
  type SystemSettingsKind,
} from "../../shared/native";
import { Button } from "../../shared/ui/button";

import { sendTestPush, usePushSubscription } from "./use-push-subscription";

const AUTOSTART_HINT: Record<NonNullable<NativePermissionStatus["oem"]>, string> = {
  xiaomi: "Безопасность → Разрешения → Автозапуск → включите Ghostline.",
  huawei:
    "Диспетчер телефона → Запуск приложений → Ghostline → «Управлять вручную», все переключатели.",
  oppo: "Диспетчер телефона → Автозапуск → включите Ghostline.",
  vivo: "iManager → Менеджер приложений → Автозапуск → включите Ghostline.",
  samsung: "Уход за устройством → Батарея → Фоновые ограничения → уберите Ghostline из «Спящих».",
};

interface RowProps {
  title: string;
  hint: string;
  /**
   * `null` = can't be verified from the app. Omitted = not a setting at all (an action row):
   * no status label, and the action is offered always.
   */
  ok?: boolean | null;
  action: string;
  onAction: () => void;
}

function Row({ title, hint, ok, action, onAction }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-mute">{hint}</span>
      </div>
      <div className="flex flex-none flex-col items-end gap-1.5">
        {ok !== undefined && (
          <span className="text-xs text-mute">
            {ok === null ? "Проверьте вручную" : ok ? "Включено" : "Выключено"}
          </span>
        )}
        {ok !== true && (
          <Button variant="secondary" onClick={onAction}>
            {action}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * "Чтобы не пропускать звонки" (FR-APP-07) — each row is a phone setting that decides whether a
 * message or call reaches the user with the app closed. Used by the first-run screen and by
 * Settings → Уведомления (hence `entities`: two features share it). The query refetches on focus,
 * so a row flips as soon as the user comes back from Android's settings.
 *
 * The last row ("Проверить звонок", T-085) isn't a setting — it's always shown, and sends a real
 * `call`-kind test push (`POST /notifications/test?kind=call`) so the user can confirm the whole
 * chain (FCM → native calling screen) works once the rows above are green.
 */
export function NativePermissionChecklist({ status }: { status: NativePermissionStatus }) {
  const queryClient = useQueryClient();
  const { status: pushStatus, subscribe } = usePushSubscription();
  const [testCallState, setTestCallState] = useState<"idle" | "sent" | "failed">("idle");

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: NATIVE_PERMISSIONS_KEY });
  };
  const openSettings = (kind: SystemSettingsKind) => (): void => {
    void openSystemSettings(kind);
  };
  const enableNotifications = (): void => {
    // Android asks once; after a refusal only its settings screen can turn them on.
    if (pushStatus === "denied") {
      void openSystemSettings("notifications");
      return;
    }
    void subscribe().then(refresh);
  };
  const testCall = (): void => {
    sendTestPush("call").then(
      () => {
        setTestCallState("sent");
      },
      () => {
        setTestCallState("failed");
      },
    );
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-[18px] border border-line">
      <Row
        title="Уведомления"
        hint="Сообщения и звонки, когда Ghostline закрыт."
        ok={status.notifications}
        action={pushStatus === "denied" ? "Открыть настройки" : "Включить"}
        onAction={enableNotifications}
      />
      {status.fullScreenCalls !== undefined && (
        <Row
          title="Звонки на весь экран"
          hint="Экран звонка поверх заблокированного телефона."
          ok={status.fullScreenCalls}
          action="Разрешить"
          onAction={openSettings("fullScreenCalls")}
        />
      )}
      <Row
        title="Без ограничений батареи"
        hint="Иначе система может усыпить приложение и пропустить звонок."
        ok={status.unrestrictedBattery}
        action="Разрешить"
        onAction={openSettings("battery")}
      />
      {status.oem && (
        <Row
          title="Автозапуск"
          hint={AUTOSTART_HINT[status.oem]}
          ok={null}
          action="Открыть"
          onAction={openSettings("autostart")}
        />
      )}
      <Row
        title="Проверить звонок"
        hint={
          testCallState === "sent"
            ? "Заблокируйте экран — через 5 секунд придёт тестовый звонок"
            : testCallState === "failed"
              ? "Не удалось отправить"
              : "Пришлёт тестовый звонок через 5 секунд — так же, как настоящий."
        }
        action="Проверить"
        onAction={testCall}
      />
    </div>
  );
}
