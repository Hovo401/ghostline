import { describe, expect, it } from "vitest";

import { toPushSubscriptionBody, urlBase64ToUint8Array } from "./push-subscription-codec";

describe("urlBase64ToUint8Array", () => {
  it("decodes a base64url VAPID key into raw bytes", () => {
    // "hello" base64url-encoded, no padding.
    const bytes = urlBase64ToUint8Array("aGVsbG8");
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });

  it("handles the URL-safe -/_ substitutions", () => {
    // Bytes [0xfb, 0xff] base64url-encode to "-_8" — plain base64 would use
    // "+/8=" for the same bytes.
    const bytes = urlBase64ToUint8Array("-_8");
    expect(Array.from(bytes)).toEqual([0xfb, 0xff]);
  });
});

describe("toPushSubscriptionBody", () => {
  it("validates a browser subscription's JSON into the wire body", () => {
    const body = toPushSubscriptionBody({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });
    expect(body).toEqual({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });
  });
});
