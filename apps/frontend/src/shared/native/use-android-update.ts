import { App } from "@capacitor/app";
import { AndroidReleaseSchema, type AndroidRelease } from "@ghostline/contracts";
import { useQuery } from "@tanstack/react-query";

import { isNativeApp } from "./is-native-app";

const LATEST_RELEASE_URL = "/downloads/android/latest.json";
const ONE_HOUR_MS = 60 * 60 * 1000;

export type AndroidUpdate =
  { status: "none" } | { status: "available" | "required"; release: AndroidRelease };

async function fetchUpdate(): Promise<AndroidUpdate> {
  const [{ build }, response] = await Promise.all([
    App.getInfo(),
    fetch(LATEST_RELEASE_URL, { cache: "no-store" }),
  ]);
  if (!response.ok) return { status: "none" };
  const parsed = AndroidReleaseSchema.safeParse(await response.json());
  if (!parsed.success) return { status: "none" };

  const installed = Number(build);
  const release = parsed.data;
  if (installed < release.minVersionCode) return { status: "required", release };
  if (installed < release.versionCode) return { status: "available", release };
  return { status: "none" };
}

/**
 * Whether the installed APK is behind `latest.json` (written by the Android release workflow).
 * Inert outside the native app; a missing or malformed `latest.json` means "no update".
 */
export function useAndroidUpdate(): AndroidUpdate {
  const { data } = useQuery({
    queryKey: ["android-update"],
    queryFn: fetchUpdate,
    enabled: isNativeApp(),
    staleTime: ONE_HOUR_MS,
    retry: false,
  });
  return data ?? { status: "none" };
}
