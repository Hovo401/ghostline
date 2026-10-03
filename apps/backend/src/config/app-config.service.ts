import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { FcmServiceAccountSchema, type Env } from "./env.schema";

/**
 * Typed facade over `@nestjs/config`. Nothing else in the app should read
 * `process.env` directly — inject this instead so every setting is
 * validated (see env.schema.ts) and grouped by concern.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get isProduction(): boolean {
    return this.config.get("NODE_ENV", { infer: true }) === "production";
  }

  get port(): number {
    return this.config.get("PORT", { infer: true });
  }

  get corsOrigin(): string {
    return this.config.get("CORS_ORIGIN", { infer: true });
  }

  get logLevel(): string {
    return this.config.get("LOG_LEVEL", { infer: true });
  }

  get databaseUrl(): string {
    return this.config.get("DATABASE_URL", { infer: true });
  }

  get redisUrl(): string {
    return this.config.get("REDIS_URL", { infer: true });
  }

  get s3(): {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
    publicUrl: string;
  } {
    return {
      endpoint: this.config.get("S3_ENDPOINT", { infer: true }),
      region: this.config.get("S3_REGION", { infer: true }),
      bucket: this.config.get("S3_BUCKET", { infer: true }),
      accessKeyId: this.config.get("S3_ACCESS_KEY_ID", { infer: true }),
      secretAccessKey: this.config.get("S3_SECRET_ACCESS_KEY", { infer: true }),
      forcePathStyle: this.config.get("S3_FORCE_PATH_STYLE", { infer: true }),
      publicUrl: this.config.get("S3_PUBLIC_URL", { infer: true }),
    };
  }

  get jwt(): { accessSecret: string; refreshSecret: string } {
    return {
      accessSecret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
      refreshSecret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
    };
  }

  get mediaMaxFileSizeBytes(): number {
    return this.config.get("MEDIA_MAX_FILE_SIZE_BYTES", { infer: true });
  }

  get livekit(): { url: string; apiUrl: string; apiKey: string; apiSecret: string } {
    return {
      url: this.config.get("LIVEKIT_URL", { infer: true }),
      apiUrl: this.config.get("LIVEKIT_API_URL", { infer: true }),
      apiKey: this.config.get("LIVEKIT_API_KEY", { infer: true }),
      apiSecret: this.config.get("LIVEKIT_API_SECRET", { infer: true }),
    };
  }

  get vapid(): { publicKey: string; privateKey: string; subject: string } {
    return {
      publicKey: this.config.get("VAPID_PUBLIC_KEY", { infer: true }),
      privateKey: this.config.get("VAPID_PRIVATE_KEY", { infer: true }),
      subject: this.config.get("VAPID_SUBJECT", { infer: true }),
    };
  }

  /** `null` when FCM isn't configured — native push is then skipped entirely. */
  get fcm(): { projectId: string; clientEmail: string; privateKey: string } | null {
    const raw = this.config.get("FCM_SERVICE_ACCOUNT_JSON", { infer: true });
    if (!raw) return null;
    // Shape already checked by env.schema.ts at boot.
    const key = FcmServiceAccountSchema.parse(JSON.parse(raw));
    return {
      projectId: key.project_id,
      clientEmail: key.client_email,
      privateKey: key.private_key,
    };
  }
}
