import { PushSubscriptionBodySchema, type PushSubscriptionBody } from "@ghostline/contracts";

/**
 * VAPID public keys arrive base64url-encoded (`GET /notifications/vapid-key`);
 * `PushManager.subscribe`'s `applicationServerKey` wants the raw bytes as a
 * `Uint8Array`. Pulled out of `use-push-subscription.ts` so this (pure,
 * no browser API calls) conversion is unit-testable on its own.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** A browser `PushSubscription`'s `.toJSON()` shape has optional/loosely
 * typed `keys` — this validates it into the wire body both `POST
 * /notifications/subscriptions` and the backend agree on. */
export function toPushSubscriptionBody(json: PushSubscriptionJSON): PushSubscriptionBody {
  return PushSubscriptionBodySchema.parse({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
  });
}
