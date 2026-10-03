import { z } from "zod";

/** The fields `FcmClient` needs out of a Firebase service-account key file. */
export const FcmServiceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.string().email(),
  private_key: z.string().includes("PRIVATE KEY"),
});

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * All process env vars the backend needs, validated once at boot.
 * Add a var here first — `AppConfigService` is the only place allowed to
 * read `process.env` directly after that (see AppConfigService below).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  CORS_ORIGIN: z.string().default("http://localhost"),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  S3_PUBLIC_URL: z.string().url(),

  // FR-MEDIA-04: default 100 MB.
  MEDIA_MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(1_073_741_824),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),

  // Self-hosted LiveKit SFU (docs/adr/0009) — 1:1 call media. `LIVEKIT_URL` is
  // the public wss:// the frontend connects to; `LIVEKIT_API_URL` is the
  // internal http(s) address `CallsService` calls to mint tokens/rooms.
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),

  // Web Push (docs/adr/0010) — VAPID keypair, generate with
  // `npx web-push generate-vapid-keys`.
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1),

  // Android app push via FCM (docs/adr/0017) — the service-account key JSON
  // the Firebase console downloads, on one line. Optional: without it the
  // worker sends no native pushes and the app only rings while it's open.
  // An empty value (as left by an env template) counts as unset.
  FCM_SERVICE_ACCOUNT_JSON: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .refine((value) => FcmServiceAccountSchema.safeParse(parseJson(value)).success, {
        message:
          "must be a Firebase service-account key JSON (project_id, client_email, private_key)",
      })
      .optional(),
  ),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
