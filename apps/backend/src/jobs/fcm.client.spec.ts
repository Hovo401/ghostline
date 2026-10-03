import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppConfigService } from "../config/app-config.service";

import { FcmClient } from "./fcm.client";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const fcmConfig = {
  fcm: { projectId: "ghostline", clientEmail: "push@ghostline.iam", privateKey },
} as unknown as AppConfigService;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

describe("FcmClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockOAuthThen(...sends: Response[]) {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: "oauth-token", expires_in: 3600 }),
    );
    for (const send of sends) fetchMock.mockResolvedValueOnce(send);
  }

  it("is disabled without FCM config", () => {
    expect(new FcmClient({ fcm: null } as unknown as AppConfigService).enabled).toBe(false);
  });

  it("sends a data-only message with the Android priority and TTL", async () => {
    mockOAuthThen(jsonResponse(200, { name: "projects/ghostline/messages/1" }));
    const client = new FcmClient(fcmConfig);

    const result = await client.send(
      "device-token",
      { v: "1", iv: "i", ct: "c" },
      {
        ttlSeconds: 45,
        priority: "HIGH",
      },
    );

    expect(result).toBe("sent");
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("https://fcm.googleapis.com/v1/projects/ghostline/messages:send");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer oauth-token");
    expect(JSON.parse(init?.body as string)).toEqual({
      message: {
        token: "device-token",
        data: { v: "1", iv: "i", ct: "c" },
        android: { priority: "HIGH", ttl: "45s" },
      },
    });
  });

  it("reuses the OAuth token across sends", async () => {
    mockOAuthThen(jsonResponse(200, {}), jsonResponse(200, {}));
    const client = new FcmClient(fcmConfig);

    await client.send("a", {}, { ttlSeconds: 60, priority: "NORMAL" });
    await client.send("b", {}, { ttlSeconds: 60, priority: "NORMAL" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports a token FCM no longer knows as unregistered", async () => {
    mockOAuthThen(
      jsonResponse(404, {
        error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] },
      }),
    );

    const result = await new FcmClient(fcmConfig).send(
      "gone",
      {},
      {
        ttlSeconds: 60,
        priority: "HIGH",
      },
    );

    expect(result).toBe("unregistered");
  });

  it("reports a server error as a plain failure, keeping the device", async () => {
    mockOAuthThen(jsonResponse(503, { error: { status: "UNAVAILABLE" } }));

    const result = await new FcmClient(fcmConfig).send(
      "token",
      {},
      {
        ttlSeconds: 60,
        priority: "HIGH",
      },
    );

    expect(result).toBe("failed");
  });
});
