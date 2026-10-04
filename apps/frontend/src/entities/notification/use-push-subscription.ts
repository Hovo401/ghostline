import type { NotificationTestKind } from "@ghostline/contracts";
import { useCallback, useEffect } from "react";
import { create } from "zustand";

import { apiFetch } from "../../shared/api/http-client";
import { Ghostline, hasGhostlinePlugin } from "../../shared/native";

import { toPushSubscriptionBody, urlBase64ToUint8Array } from "./push-subscription-codec";
import {
  resetNativeRegistrationForTests,
  resyncNativeDevice,
  syncNativeDevice,
} from "./use-native-push-registration";

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

function initialStatus(): PushSubscriptionStatus {
  return isPushSupported() || hasGhostlinePlugin() ? "pending" : "unsupported";
}

/**
 * The Android app has no Push API: its status is the Android notification permission plus
 * whether this install is registered for FCM (`use-native-push-registration.ts`).
 */
async function nativeStatus(): Promise<PushSubscriptionStatus> {
  const { notifications } = await Ghostline.checkPermissions();
  if (notifications === "denied") return "denied";
  if (notifications !== "granted") return "unsubscribed";
  return (await syncNativeDevice()) ? "subscribed" : "unsubscribed";
}

/** One status for every mount: the first-open prompt, the chat-list banner
 * and the settings tab are on screen together, and enabling push in one
 * must flip the others too — per-mount state left the banner offering
 * «Включить» right after the prompt had subscribed. */
const usePushStatusStore = create<{ status: PushSubscriptionStatus }>(() => ({
  status: initialStatus(),
}));

function setStatus(status: PushSubscriptionStatus): void {
  usePushStatusStore.setState({ status });
}

/** Asks the server to push a test notification to every device of the
 * signed-in user — the same path real messages take. `kind` picks what the
 * Android app does with it ("call" rings the test-call screen 5s later,
 * see `NativePermissionChecklist`'s "Проверить звонок"); omitted, the
 * server sends its default plain test notification. */
export async function sendTestPush(kind?: NotificationTestKind): Promise<void> {
  const path = kind ? `/notifications/test?kind=${kind}` : "/notifications/test";
  await apiFetch(path, { method: "POST" });
}

/** Test-only: forget the per-page-load sync. */
export function resetPushSyncForTests(): void {
  syncOnce = null;
  resetNativeRegistrationForTests();
  setStatus(initialStatus());
}

/**
 * Web Push subscribe/unsubscribe flow (calls plan §Фаза 5, FR-NOTIF-04) —
 * `subscribe()` must only be called from an explicit user action (a click
 * handler, e.g. `NotificationsTab`'s "Включить уведомления" button):
 * browsers require a user gesture before `Notification.requestPermission()`
 * will even prompt, let alone grant.
 */
export function usePushSubscription() {
  const status = usePushStatusStore((state) => state.status);

  const refresh = useCallback(async (): Promise<void> => {
    if (hasGhostlinePlugin()) {
      try {
        setStatus(await nativeStatus());
      } catch (error) {
        console.error("native push status failed", error);
        setStatus("unsubscribed");
      }
      return;
    }
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
    if (hasGhostlinePlugin()) {
      try {
        const { notifications } = await Ghostline.requestPermissions();
        if (notifications !== "granted") {
          setStatus(notifications === "denied" ? "denied" : "unsubscribed");
          return;
        }
        setStatus((await resyncNativeDevice()) ? "subscribed" : "unsubscribed");
      } catch (error) {
        console.error("native push subscribe failed", error);
        setStatus("unsubscribed");
      }
      return;
    }
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

  /** Also called on logout (`features/settings/LogoutButton`) so a
   * signed-out device stops receiving this account's pushes. */
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
