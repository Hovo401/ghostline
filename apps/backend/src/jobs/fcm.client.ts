import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { AppConfigService } from "../config/app-config.service";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** Refresh the OAuth token this long before Google says it expires. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export interface FcmSendOptions {
  ttlSeconds: number;
  /** HIGH wakes the device out of Doze immediately — calls and messages; NORMAL is batched. */
  priority: "HIGH" | "NORMAL";
}

/** `unregistered`: FCM will never deliver to this token again — drop the device row. */
export type FcmSendResult = "sent" | "unregistered" | "failed";

interface FcmErrorBody {
  error?: { status?: string; details?: { errorCode?: string }[] };
}

const DEAD_TOKEN_ERROR_CODES = new Set(["UNREGISTERED", "SENDER_ID_MISMATCH"]);

/**
 * Minimal FCM HTTP v1 sender (docs/adr/0017) — data-only messages to one
 * device token. Authenticates as the service account from
 * `FCM_SERVICE_ACCOUNT_JSON` with the standard OAuth 2.0 JWT-bearer grant
 * (an RS256 assertion signed by `@nestjs/jwt`, already a dependency) instead
 * of pulling in `firebase-admin`/`google-auth-library` for one POST.
 */
@Injectable()
export class FcmClient {
  private readonly logger = new Logger(FcmClient.name);
  private readonly jwt = new JwtService();
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return this.config.fcm !== null;
  }

  async send(
    token: string,
    data: Record<string, string>,
    options: FcmSendOptions,
  ): Promise<FcmSendResult> {
    const fcm = this.config.fcm;
    if (!fcm) return "failed";

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${fcm.projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${await this.getAccessToken()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            data,
            android: { priority: options.priority, ttl: `${String(options.ttlSeconds)}s` },
          },
        }),
      },
    );
    if (response.ok) return "sent";

    const body = (await response.json().catch(() => ({}))) as FcmErrorBody;
    const errorCode = body.error?.details?.find((d) => d.errorCode)?.errorCode;
    if (
      response.status === 404 ||
      (errorCode !== undefined && DEAD_TOKEN_ERROR_CODES.has(errorCode)) ||
      // Our payload is schema-built, so INVALID_ARGUMENT means a malformed token.
      body.error?.status === "INVALID_ARGUMENT"
    ) {
      return "unregistered";
    }
    if (response.status === 401) this.accessToken = null;
    this.logger.warn(`FCM send failed (${String(response.status)} ${errorCode ?? ""})`);
    return "failed";
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now()) {
      return this.accessToken.value;
    }
    const fcm = this.config.fcm;
    if (!fcm) throw new Error("FCM is not configured");

    const assertion = this.jwt.sign(
      { scope: FCM_SCOPE },
      {
        algorithm: "RS256",
        privateKey: fcm.privateKey,
        issuer: fcm.clientEmail,
        audience: OAUTH_TOKEN_URL,
        expiresIn: "1h",
      },
    );
    const response = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) {
      throw new Error(`FCM OAuth token request failed (${String(response.status)})`);
    }
    const { access_token, expires_in } = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = {
      value: access_token,
      expiresAt: Date.now() + expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS,
    };
    return access_token;
  }
}
