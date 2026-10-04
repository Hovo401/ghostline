import { z } from "zod";

/**
 * `/downloads/android/latest.json` — written by the Android release workflow, read by the
 * in-app update banner. `build` of the installed app (its `versionCode`) is compared to these.
 */
export const AndroidReleaseSchema = z.object({
  versionCode: z.number().int().positive(),
  versionName: z.string().min(1),
  /** Installs below this must update — the banner can't be dismissed. */
  minVersionCode: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  url: z.string().min(1),
  changelog: z.string(),
});
export type AndroidRelease = z.infer<typeof AndroidReleaseSchema>;
