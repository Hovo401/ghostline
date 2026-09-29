import type { PushPayload } from "@ghostline/contracts";

export interface BuiltNotification {
  title: string;
  options: NotificationOptions;
}

/**
 * `vite-plugin-pwa`'s `injectManifest` build bundles `sw.ts` with its own
 * isolated Rollup pass that (unlike the main app build, see
 * `vite.config.ts`'s `build.commonjsOptions` comment) can't resolve
 * `@ghostline/contracts`'s named exports from its CJS `dist/` — so the
 * service worker can only use it for types (erased at compile time), never
 * at runtime. This is a small duck-typed stand-in for `PushPayloadSchema`
 * covering just enough shape to safely dispatch on `kind`; a malformed or
 * unknown-`kind` payload (e.g. a stale client on an older contract version)
 * returns `null` instead of throwing.
 */
export function parsePushPayload(data: unknown): PushPayload | null {
  if (typeof data !== "object" || data === null || !("kind" in data)) return null;
  const kind = data.kind;
  if (
    kind === "message" ||
    kind === "call:incoming" ||
    kind === "call:closed" ||
    kind === "call:missed" ||
    kind === "test"
  ) {
    return data as PushPayload;
  }
  return null;
}

const APP_NAME = "Ghostline";

const RING_VIBRATION_PATTERN = [400, 200, 400, 200, 400];

function previewForNonText(type: string): string {
  switch (type) {
    case "image":
      return "Фото";
    case "file":
      return "Файл";
    case "voice":
      return "Голосовое сообщение";
    case "video":
      return "Видеосообщение";
    case "call":
      return "Звонок";
    default:
      return "Новое сообщение";
  }
}

/**
 * Pure mapping from a validated push payload to `Notification`'s
 * title/options — the one part of `sw.ts`'s `push` handler actually worth
 * unit testing (calls plan: "обработчики как чистые функции (тестируемы)");
 * everything else in that handler is glue around Service Worker APIs a unit
 * test can't meaningfully exercise (`self.registration.showNotification`,
 * `clients.matchAll`, …).
 */
export function buildNotificationOptions(payload: PushPayload): BuiltNotification {
  switch (payload.kind) {
    case "message": {
      const body = !payload.preview
        ? "Новое сообщение"
        : payload.message.type === "text"
          ? (payload.message.text ?? "Новое сообщение")
          : previewForNonText(payload.message.type);
      return {
        title: payload.chatTitle,
        options: {
          body,
          tag: `chat:${payload.chatId}`,
          renotify: true,
          data: { kind: "message", chatId: payload.chatId },
        },
      };
    }
    case "call:incoming":
      return {
        title: payload.callerName,
        options: {
          body: payload.call.video ? "Входящий видеозвонок" : "Входящий аудиозвонок",
          tag: `call:${payload.call.id}`,
          requireInteraction: true,
          vibrate: RING_VIBRATION_PATTERN,
          actions: [
            { action: "answer", title: "Ответить" },
            { action: "decline", title: "Отклонить" },
          ],
          data: {
            kind: "call:incoming",
            callId: payload.call.id,
            declineToken: payload.declineToken,
          },
        },
      };
    case "call:closed":
      return {
        title: APP_NAME,
        options: {
          body:
            payload.reason === "answered-elsewhere"
              ? "Звонок принят на другом устройстве"
              : "Звонок завершён",
          tag: `call:${payload.callId}`,
          // Content, but no sound/vibration — this replaces the ringing
          // notification once the call is no longer actionable, it
          // shouldn't wake the user up again (ADR-0010 amendment, calls
          // plan §Фаза 5 "не делать тихих push": Safari revokes a push
          // subscription after too many silent/no-op notifications, so this
          // still has to call showNotification, just quietly).
          silent: true,
          data: { kind: "call:closed", callId: payload.callId },
        },
      };
    case "call:missed":
      return {
        title: payload.callerName,
        options: {
          body: "Пропущенный звонок",
          tag: `call:${payload.call.id}`,
          renotify: true,
          data: { kind: "call:missed", callId: payload.call.id },
        },
      };
    case "test":
      return {
        title: APP_NAME,
        options: {
          body: "Тестовое уведомление — push работает",
          tag: "test",
          data: { kind: "test" },
        },
      };
  }
}

/** Whether at least one open window client is actually visible right now —
 * `sw.ts`'s `push` handler suppresses the system notification in favor of a
 * `postMessage` handoff whenever this is true (ADR-0010). Pulled out as a
 * pure function of the client list so it's testable without a real
 * `Clients` API. */
export function hasVisibleWindowClient(clients: readonly { visibilityState?: string }[]): boolean {
  return clients.some((client) => client.visibilityState === "visible");
}
