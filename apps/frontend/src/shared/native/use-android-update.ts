import { AndroidReleaseSchema, type AndroidRelease } from "@ghostline/contracts";
import { useQuery } from "@tanstack/react-query";

import { getInstalledBuild } from "./installed-build";
import { isNativeApp } from "./is-native-app";

const LATEST_RELEASE_URL = "/downloads/android/latest.json";
const ONE_HOUR_MS = 60 * 60 * 1000;

export type AndroidUpdate =
  { status: "none" } | { status: "available" | "required"; release: AndroidRelease };

async function fetchLatestRelease(): Promise<AndroidRelease | null> {
  const response = await fetch(LATEST_RELEASE_URL, { cache: "no-store" });
  if (!response.ok) return null;
  const parsed = AndroidReleaseSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

/**
 * The release published by the Android workflow (`latest.json`), or `null` while loading, when
 * none is published yet, or when the file is malformed. One shared query: the browser's download
 * button and the in-app update banner both read it.
 */
export function useLatestAndroidRelease(enabled: boolean): AndroidRelease | null {
  const { data } = useQuery({
    queryKey: ["android-latest-release"],
    queryFn: fetchLatestRelease,
    enabled,
    staleTime: ONE_HOUR_MS,
    retry: false,
  });
  return data ?? null;
}

/**
 * Whether the installed APK is behind `latest.json`. Inert outside the native app.
 */
export function useAndroidUpdate(): AndroidUpdate {
  const native = isNativeApp();
  const release = useLatestAndroidRelease(native);
  const { data: build } = useQuery({
    queryKey: ["android-installed-build"],
    queryFn: getInstalledBuild,
    enabled: native,
    staleTime: Infinity,
  });

  if (!release || build === undefined) return { status: "none" };
  if (build < release.minVersionCode) return { status: "required", release };
  if (build < release.versionCode) return { status: "available", release };
  return { status: "none" };
}
