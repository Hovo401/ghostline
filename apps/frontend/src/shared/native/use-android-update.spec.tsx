import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getInfo, isNativeApp } = vi.hoisted(() => ({ getInfo: vi.fn(), isNativeApp: vi.fn() }));

vi.mock("@capacitor/app", () => ({ App: { getInfo } }));
vi.mock("./is-native-app", () => ({ isNativeApp }));

import { useAndroidUpdate } from "./use-android-update";

const release = {
  versionCode: 5,
  versionName: "1.2.0",
  minVersionCode: 3,
  sha256: "a".repeat(64),
  url: "/downloads/android/ghostline-5.apk",
  changelog: "",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function serve(body: unknown, ok = true): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }));
}

describe("useAndroidUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    isNativeApp.mockReturnValue(true);
    getInfo.mockResolvedValue({ build: "5" });
    serve(release);
  });

  it("reports nothing when up to date", async () => {
    const { result } = renderHook(() => useAndroidUpdate(), { wrapper });
    await waitFor(() => {
      expect(getInfo).toHaveBeenCalled();
    });
    expect(result.current.status).toBe("none");
  });

  it("reports an available update", async () => {
    getInfo.mockResolvedValue({ build: "4" });
    const { result } = renderHook(() => useAndroidUpdate(), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe("available");
    });
  });

  it("reports a required update below minVersionCode", async () => {
    getInfo.mockResolvedValue({ build: "2" });
    const { result } = renderHook(() => useAndroidUpdate(), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe("required");
    });
  });

  it("treats a malformed latest.json as no update", async () => {
    getInfo.mockResolvedValue({ build: "1" });
    serve({ nope: true });
    const { result } = renderHook(() => useAndroidUpdate(), { wrapper });
    await waitFor(() => {
      expect(getInfo).toHaveBeenCalled();
    });
    expect(result.current.status).toBe("none");
  });

  it("does nothing outside the native app", () => {
    isNativeApp.mockReturnValue(false);
    renderHook(() => useAndroidUpdate(), { wrapper });
    expect(getInfo).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
