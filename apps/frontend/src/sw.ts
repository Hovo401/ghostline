/// <reference lib="webworker" />
// This file is bundled standalone by `vite-plugin-pwa`'s `injectManifest`
// mode (see vite.config.ts) — it runs in the ServiceWorker global scope,
// not the page's Window, so it gets its own tsconfig (tsconfig.sw.json,
// "WebWorker" lib instead of "DOM") and is excluded from the app's regular
// `tsc` program; `pnpm run typecheck` runs both. See `sw-notifications.ts`
// for the pure payload → `Notification` options mapping this calls into.
export {};
declare const self: ServiceWorkerGlobalScope;

import type { PushPayload } from "@ghostline/contracts";

import {
  buildNotificationOptions,
  hasVisibleWindowClient,
  parsePushPayload,
} from "./sw-notifications";

/** Posted to every open window client when a push arrived while one of them
 * was visible (suppressing the system notification, ADR-0010) — mirrored by
 * `features/chat/use-service-worker-messages.ts` on the page side. */
interface PushHandoffMessage {
  source: "ghostline-push";
  payload: PushPayload;
}

/** Posted to the focused/newly-opened client on a notification click that
 * wasn't handled entirely in the SW (i.e. not "Отклонить") — a small,
 * honest subset of a notification's `data`, not a full `PushPayload` (a
 * click only ever needs "which chat to open", never the message/call
 * contents again). */
interface NotificationClickHandoffMessage {
  source: "ghostline-notification-click";
  chatId?: string;
  callId?: string;
  answer?: boolean;
}

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function windowClients(): Promise<readonly WindowClient[]> {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

async function postToAllClients(message: PushHandoffMessage): Promise<void> {
  const clients = await windowClients();
  clients.forEach((client) => {
    client.postMessage(message);
  });
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  event.waitUntil(
    (async () => {
      let payload: PushPayload | null;
      try {
        payload = parsePushPayload(event.data?.json());
      } catch {
        payload = null;
      }
      if (!payload) {
        // Not a payload this app understands (e.g. a stale client on an
        // older contract version) — nothing sensible to show.
        return;
      }

      const clients = await windowClients();
      if (hasVisibleWindowClient(clients)) {
        // A visible tab already gets this over the WS (`message:new`/
        // `call:incoming`) — handing it off here too is only useful for an
        // in-app toast/sound cue, which needs a `shared/ui` toast primitive
        // this app doesn't have yet (BACKLOG.md); the handoff message still
        // goes out so that's a page-side addition later, not a SW change.
        await postToAllClients({ source: "ghostline-push", payload });
        return;
      }

      // Every branch below here must call `showNotification` — a push that
      // shows nothing (silently closing a stale notification, say) reads to
      // Chrome as "site updated in the background" and to Safari as one of
      // the too-many-silent-pushes strikes that gets a subscription revoked
      // (calls plan §Фаза 5 doc T-068). `showNotification` with the same
      // `tag` as an existing notification replaces it in place, so
      // `call:closed` doesn't need to close the old one first.
      const built = buildNotificationOptions(payload);
      await self.registration.showNotification(built.title, built.options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const data = notification.data as
    { kind: string; callId?: string; declineToken?: string; chatId?: string } | undefined;
  notification.close();

  if (
    event.action === "decline" &&
    data?.kind === "call:incoming" &&
    data.callId &&
    data.declineToken
  ) {
    event.waitUntil(
      fetch(`/api/v1/calls/${data.callId}/decline?t=${encodeURIComponent(data.declineToken)}`, {
        method: "POST",
      }).catch(() => undefined),
    );
    return;
  }

  // Bare click, or "answer" on an incoming-call notification: focus an
  // existing tab and hand off what to open there (which chat, or "answer
  // this call"); with no tab open, `/app`'s deep-link search params carry
  // the same context across the fresh page load (calls plan §Фаза 5 doc
  // T-068, `routes/app.tsx` + `use-notification-deep-link.ts`).
  const isAnswerableCall =
    data?.kind === "call:incoming" && (event.action === "answer" || event.action === "");
  const callId = isAnswerableCall ? data.callId : undefined;
  const chatId = data?.kind === "message" ? data.chatId : undefined;

  event.waitUntil(
    (async () => {
      const clients = await windowClients();
      const target = clients[0];
      if (target) {
        await target.focus();
        const message: NotificationClickHandoffMessage = {
          source: "ghostline-notification-click",
          chatId,
          callId,
          answer: callId ? true : undefined,
        };
        target.postMessage(message);
        return;
      }
      if (callId) {
        await self.clients.openWindow(`/app?call=${encodeURIComponent(callId)}&answer=1`);
        return;
      }
      if (chatId) {
        await self.clients.openWindow(`/app?chat=${encodeURIComponent(chatId)}`);
        return;
      }
      await self.clients.openWindow("/app");
    })(),
  );
});
