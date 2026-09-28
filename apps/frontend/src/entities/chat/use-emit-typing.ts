import { useCallback, useRef } from "react";

import { getSocketClient } from "../../shared/api/socket-client";

/** Composer calls this on every keystroke; it only actually emits at most
 * once per this interval so typing a whole sentence doesn't flood the
 * socket — the peer's `use-typing-realtime` timeout (4s) comfortably
 * outlasts this gap either way. */
const EMIT_INTERVAL_MS = 2000;

export function useEmitTyping(chatId: string): () => void {
  const lastSentRef = useRef(0);

  return useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < EMIT_INTERVAL_MS) return;
    lastSentRef.current = now;
    getSocketClient().emit("typing", { chatId, action: "typing" });
  }, [chatId]);
}
