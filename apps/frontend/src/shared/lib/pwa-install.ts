import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Chromium's install prompt event — not in TypeScript's DOM lib. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaInstallState {
  /** The deferred `beforeinstallprompt` — Chromium (Android/desktop Chrome,
   * Edge) fires it once the app is installable; `prompt()` works once. */
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
  bannerDismissed: boolean;
  dismissBanner: () => void;
}

export const PWA_INSTALL_STORAGE_KEY = "ghostline:pwa-install";

export const usePwaInstallStore = create<PwaInstallState>()(
  persist(
    (set) => ({
      deferred: null,
      installed: false,
      bannerDismissed: false,
      dismissBanner: () => {
        set({ bannerDismissed: true });
      },
    }),
    {
      name: PWA_INSTALL_STORAGE_KEY,
      partialize: (state) => ({ bannerDismissed: state.bannerDismissed }),
    },
  ),
);

/**
 * Call once at boot (`app/main.tsx`), before React mounts:
 * `beforeinstallprompt` can fire before any component exists to listen for
 * it, and it doesn't fire again. Its default (Chrome's own mini-infobar on
 * Android) is suppressed so the app's install buttons are the one entry.
 */
export function listenForInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    usePwaInstallStore.setState({ deferred: event as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => {
    usePwaInstallStore.setState({ deferred: null, installed: true });
  });
}

const IOS_UA_PATTERN = /iphone|ipad|ipod/i;

export function isIosUserAgent(userAgent: string): boolean {
  return IOS_UA_PATTERN.test(userAgent);
}

/** Whether the page is currently running installed to the home screen /
 * standalone — already installed, so nothing to offer. */
export function isStandaloneDisplay(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/** `"prompt"` — the browser's own install dialog is available; `"ios"` —
 * Safari has no install API, only "Поделиться → На экран «Домой»";
 * `null` — already installed or the browser can't install (Firefox
 * desktop): render nothing. */
export type PwaInstallMode = "prompt" | "ios" | null;

export function usePwaInstall(): { mode: PwaInstallMode; install: () => Promise<void> } {
  const deferred = usePwaInstallStore((state) => state.deferred);
  const installed = usePwaInstallStore((state) => state.installed);

  let mode: PwaInstallMode = null;
  if (!installed && !isStandaloneDisplay()) {
    if (deferred) mode = "prompt";
    else if (isIosUserAgent(navigator.userAgent)) mode = "ios";
  }

  const install = useCallback(async (): Promise<void> => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // A deferred prompt is single-use either way.
    usePwaInstallStore.setState({ deferred: null, installed: outcome === "accepted" });
  }, [deferred]);

  return { mode, install };
}

/** Shared copy for the iOS path — Safari can only install by hand. */
export const IOS_INSTALL_HINT = "Нажмите «Поделиться», затем «На экран «Домой»».";
