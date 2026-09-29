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
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    setStatus(existing ? "subscribed" : "unsubscribed");
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
    const registration = await navigator.serviceWorker.ready;
    const publicKey = await fetchVapidPublicKey();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await apiFetch("/notifications/subscriptions", {
      method: "POST",
      body: toPushSubscriptionBody(subscription.toJSON()),
    });
    setStatus("subscribed");
  }, []);

  /** Also called on logout (once a logout action exists — none does yet,
   * see BACKLOG.md) so a signed-out device stops receiving this account's
   * pushes. */
  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isPushSupported()) return;
    const registration = await navigator.serviceWorker.ready;
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
