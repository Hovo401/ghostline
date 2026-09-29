import { useEffect } from "react";

import { getSocketClient } from "../../shared/api/socket-client";

import { useTypingStore } from "./typing-store";

/** How long a `typing` event stays "true" if the sender doesn't repeat it —
 * the client stops sending well before this, so it reads as "stopped
 * typing" instead of stalling on. */
const TYPING_TIMEOUT_MS = 4000;

/** Subscribes the shared socket's `typing` event into `typing-store` — one
 * instance of this mounted near the top of the chat feature keeps every
 * chat's typing state current, per apps/frontend/CLAUDE.md's realtime rule. */
export function useTypingRealtime(): void {
  const setTyping = useTypingStore((state) => state.setTyping);
  const clearTyping = useTypingStore((state) => state.clearTyping);

  useEffect(() => {
    const socket = getSocketClient();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const handleTyping = (payload: { chatId: string; userId: string }): void => {
      setTyping(payload.chatId, payload.userId);
      const key = `${payload.chatId}:${payload.userId}`;
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          clearTyping(payload.chatId, payload.userId);
          timers.delete(key);
        }, TYPING_TIMEOUT_MS),
      );
    };

    socket.on("typing", handleTyping);
    return () => {
      socket.off("typing", handleTyping);
      timers.forEach((timer) => {
        clearTimeout(timer);
      });
    };
  }, [setTyping, clearTyping]);
}
