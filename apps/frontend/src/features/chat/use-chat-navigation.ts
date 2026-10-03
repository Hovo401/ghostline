import { useRouter, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

/** The open chat — `/app?chat=<id>` is its source of truth, so opening a
 * chat is a history entry Back/Forward can step through. */
export function useSelectedChatId(): string | null {
  return useSearch({ strict: false, select: (search) => search.chat ?? null });
}

/**
 * Opens a chat the way Telegram does on phone: from the list it pushes, so
 * Back returns to the list; switching from one open chat to another (the
 * desktop list, a notification click) or out of an overlay (the "new chat"
 * modal) replaces instead, so Back from any chat is always one step to the
 * list and never walks back through every chat visited.
 */
export function useOpenChat(): (chatId: string) => void {
  const router = useRouter();
  return useCallback(
    (chatId: string) => {
      const { search, state } = router.history.location;
      const current = new URLSearchParams(search).get("chat");
      if (current === chatId) return;
      const replace = current !== null || state.glOverlay !== undefined;
      void router.navigate({
        to: "/app",
        search: { chat: chatId },
        replace,
        state: { inAppBack: current !== null ? state.inAppBack : true },
      });
    },
    [router],
  );
}
