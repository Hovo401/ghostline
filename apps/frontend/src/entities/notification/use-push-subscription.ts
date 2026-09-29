import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../../shared/api/http-client";

import { toPushSubscriptionBody, urlBase64ToUint8Array } from "./push-subscription-codec";

export type PushSubscriptionStatus =
  "unsupported" | "denied" | "unsubscribed" | "subscribed" | "pending";

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function fetchVapidPublicKey(): Promise<string> {
  const data = (await apiFetch("/notifications/vapid-key")) as { publicKey: string };
  return data.publicKey;
}

const SW_READY_TIMEOUT_MS = 10_000;

/** `navigator.serviceWorker.ready` never settles if no SW registers — cap
 * it so `status` can't sit on "pending" forever. */
async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("service worker not ready"));
      }, SW_READY_TIMEOUT_MS);
    }),
  ]);
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, i) => byte === key[i]);
}

/**
 * Makes this browser's subscription valid *and* registered to the signed-in
 * user on the server. Needed on every load, not just on the first "Включить"
 * click, because the browser-side subscription outlives the server row:
 * - the server deleted it (the push service answered 403/404/410, or the DB
 *   was reset) — the browser still reports a subscription, nothing arrives;
 * - the VAPID key changed — the old subscription can't be delivered to;
 * - another account signed in on this browser and took the endpoint (it's
 *   unique per browser) — re-posting hands it back to whoever is signed in.
 * The POST is an upsert by endpoint, so repeating it is harmless.
 */
async function registerSubscription(
  registration: ServiceWorkerRegistration,
  existing: PushSubscription | null,
): Promise<void> {
  const key = urlBase64ToUint8Array(await fetchVapidPublicKey());
  let subscription = existing;
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  await apiFetch("/notifications/subscriptions", {
    method: "POST",
    body: toPushSubscriptionBody(subscription.toJSON()),
  });
}

/** Several components mount this hook at once — sync with the server once per page load. */
let syncOnce: Promise<void> | null = null;

/** Asks the server to push a test notification to every device of the
 * signed-in user — the same path real messages take. */
export async function sendTestPush(): Promise<void> {
  await apiFetch("/notifications/test", { method: "POST" });
}

/** Test-only: forget the per-page-load sync. */
export function resetPushSyncForTests(): void {
  syncOnce = null;
}

/**
 * Web Push subscribe/unsubscribe flow (calls plan §Фаза 5, FR-NOTIF-04) —
 * `subscribe()` must only be called from an explicit user action (a click
 * handler, e.g. `NotificationsTab`'s "Включить уведомления" button):
 * browsers require a user gesture before `Notification.requestPermission()`
 * will even prompt, let alone grant.
 */
export function usePushSubscription() {
  const [status, setStatus] = useState<PushSubscriptionStatus>(
    isPushSupported() ? "pending" : "unsupported",
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const registration = await readyRegistration();
      const existing = await registration.pushManager.getSubscription();
      // No browser subscription = the user never enabled push here, or
      // turned it off — respect that, don't resubscribe behind their back.
      if (!existing || Notification.permission !== "granted") {
        setStatus("unsubscribed");
        return;
      }
      syncOnce ??= registerSubscription(registration, existing);
      await syncOnce;
      setStatus("subscribed");
    } catch (error) {
      syncOnce = null;
      console.error("push subscription sync failed", error);
      setStatus("unsubscribed");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const subscribe = useCallback(async (): Promise<void> => {
    if (!isPushSupported()) return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus("denied");
      return;
    }
    try {
      const registration = await readyRegistration();
      const existing = await registration.pushManager.getSubscription();
      await registerSubscription(registration, existing);
      setStatus("subscribed");
    } catch (error) {
      console.error("push subscribe failed", error);
      setStatus("unsubscribed");
    }
  }, []);

  /** Also called on logout (once a logout action exists — none does yet,
   * see BACKLOG.md) so a signed-out device stops receiving this account's
   * pushes. */
  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isPushSupported()) return;
    const registration = await readyRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      setStatus("unsubscribed");
      return;
    }
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await apiFetch("/notifications/subscriptions", { method: "DELETE", body: { endpoint } });
    setStatus("unsubscribed");
  }, []);

  return { status, subscribe, unsubscribe };
}
