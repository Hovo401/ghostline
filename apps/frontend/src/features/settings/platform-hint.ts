/**
 * Platform-specific nudge shown in `NotificationsTab` about what it takes to
 * actually receive pushes/calls with the app or browser closed (calls plan
 * §Фаза 5 doc T-068's platform-limits table) — a pure function of the UA
 * string and whether the page is already running installed/standalone, so
 * it's testable without touching `navigator`/`matchMedia` directly.
 */
export interface PlatformHint {
  kind: "ios" | "android" | "desktop";
  text: string;
}

const IOS_UA_PATTERN = /iphone|ipad|ipod/i;
const ANDROID_UA_PATTERN = /android/i;
const DESKTOP_CHROMIUM_UA_PATTERN = /chrome|edg/i;

export function detectPlatformHint(userAgent: string, standalone: boolean): PlatformHint | null {
  if (IOS_UA_PATTERN.test(userAgent)) {
    if (standalone) return null;
    return {
      kind: "ios",
      text:
        "Чтобы получать уведомления при закрытом приложении, добавьте Ghostline на экран " +
        "«Домой»: Поделиться → «На экран Домой».",
    };
  }

  if (ANDROID_UA_PATTERN.test(userAgent)) {
    return {
      kind: "android",
      text: "Установите приложение и разрешите его фоновую работу, чтобы не пропустить звонки при закрытом браузере.",
    };
  }

  if (DESKTOP_CHROMIUM_UA_PATTERN.test(userAgent)) {
    return {
      kind: "desktop",
      text: "Чтобы уведомления и звонки приходили при закрытом браузере, включите в настройках браузера фоновую работу приложений.",
    };
  }

  return null;
}

/** Whether the page is currently running installed to the home screen /
 * standalone — the one bit `detectPlatformHint` needs beyond the UA string,
 * pulled out so the component can pass it in instead of the function
 * reaching for `window` itself. */
export function isStandaloneDisplay(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  );
}
