import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { listenForInstallPrompt, usePwaInstall, usePwaInstallStore } from "./pwa-install";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36";
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";

function stubUserAgent(userAgent: string): void {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
}

function stubStandalone(standalone: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: standalone, media: query }));
}

function fireInstallPrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe("usePwaInstall", () => {
  beforeAll(() => {
    listenForInstallPrompt();
  });

  beforeEach(() => {
    usePwaInstallStore.setState({ deferred: null, installed: false, bannerDismissed: false });
    stubStandalone(false);
    stubUserAgent(ANDROID_UA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("offers nothing until the browser says the app is installable", () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.mode).toBeNull();
  });

  it("captures beforeinstallprompt and replays it from install()", async () => {
    const { result } = renderHook(() => usePwaInstall());
    const event = fireInstallPrompt("accepted");

    expect(event.defaultPrevented).toBe(true);
    expect(result.current.mode).toBe("prompt");

    await act(async () => {
      await result.current.install();
    });

    expect(event.prompt).toHaveBeenCalledOnce();
    expect(result.current.mode).toBeNull();
  });

  it("hides once the app reports installed", () => {
    const { result } = renderHook(() => usePwaInstall());
    fireInstallPrompt();

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(result.current.mode).toBeNull();
  });

  it("offers the manual steps on iOS, where there's no install API", () => {
    stubUserAgent(IOS_UA);
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.mode).toBe("ios");
  });

  it("offers nothing when already running installed", () => {
    stubUserAgent(IOS_UA);
    stubStandalone(true);
    const { result } = renderHook(() => usePwaInstall());
    fireInstallPrompt();
    expect(result.current.mode).toBeNull();
  });
});
