import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** The entry below this one is inside the messenger (`/app/*`), so a
     * screen's "←" can be a real `history.back()` instead of a push. Set on
     * navigations into a sub-screen (a chat, settings). */
    inAppBack?: boolean;
  }
}

/**
 * "←" for a messenger sub-screen (open chat on phone, settings): steps back
 * through real history when we pushed this entry from inside the app, so
 * Back/Forward and the on-screen arrow stay one consistent stack. Landed
 * here directly (deep link, reload, notification) → there's nothing of
 * ours to go back to, so replace with the chat list instead of leaving the
 * site.
 */
export function useInAppBack(): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.history.location.state.inAppBack) router.history.back();
    else void router.navigate({ to: "/app", replace: true });
  }, [router]);
}
