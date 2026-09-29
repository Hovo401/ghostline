import type { Message } from "@ghostline/contracts";
import { useEffect } from "react";

import { getSocketClient } from "../../shared/api/socket-client";
import { useCurrentUserId } from "../user/use-current-user-id";

function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * In-page fallback for message notifications when Web Push isn't set up
 * (calls plan §Фаза 5 "Fallback без Push API") — shows a system
 * `Notification` straight from the page via the existing WS `message:new`
 * event whenever the tab is hidden. Tagged the same way `sw.ts` tags a
 * message push (`chat:<id>`) so the two collapse into one notification
 * rather than doubling up if both somehow fire for the same chat. `enabled`
 * should be `false` while a push subscription is active (its own SW-driven
 * path already covers the hidden-tab case) — the caller (`Chat.tsx`) wires
 * that from `usePushSubscription`'s status.
 */
export function useMessageNotificationFallback(enabled: boolean): void {
  const currentUserId = useCurrentUserId();

  useEffect(() => {
    if (!enabled || !isNotificationSupported()) return;
    const socket = getSocketClient();

    const handleNewMessage = (message: Message): void => {
      if (!document.hidden) return;
      if (message.senderId === currentUserId) return;
      if (Notification.permission !== "granted") return;
      const body =
        message.type === "text" ? (message.text ?? "Новое сообщение") : "Новое сообщение";
      const notification = new Notification("Ghostline", {
        body,
        tag: `chat:${message.chatId}`,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    };

    socket.on("message:new", handleNewMessage);
    return () => {
      socket.off("message:new", handleNewMessage);
    };
  }, [enabled, currentUserId]);
}
