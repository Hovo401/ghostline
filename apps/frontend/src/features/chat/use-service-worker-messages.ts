import { useEffect } from "react";

import { useCallActions } from "../../entities/call";

import { useChatUiStore } from "./chat-ui-store";

interface NotificationClickHandoffMessage {
  source: "ghostline-notification-click";
  chatId?: string;
  callId?: string;
  answer?: boolean;
}

function isNotificationClickHandoff(data: unknown): data is NotificationClickHandoffMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { source?: unknown }).source === "ghostline-notification-click"
  );
}

/**
 * Reacts to `sw.ts`'s notification-click handoff (calls plan §Фаза 5):
 * clicking a message push's system notification focuses this tab and posts
 * which chat it was for, so the page opens straight to it instead of
 * landing on whatever was already selected; clicking (or hitting "Ответить"
 * on) a call push's notification posts `callId`+`answer` instead, so this
 * tab actually answers the call. Mount once (`Chat.tsx`).
 *
 * The push-time visible-tab handoff (`source: "ghostline-push"`) isn't
 * handled here — a visible tab already has the real update over the WS
 * (`message:new`/`call:incoming`); reacting to that handoff too would only
 * add an in-app toast/sound cue, which needs a `shared/ui` toast primitive
 * this app doesn't have yet (see `sw.ts`'s matching comment).
 */
export function useServiceWorkerMessages(): void {
  const selectChat = useChatUiStore((state) => state.selectChat);
  const { accept } = useCallActions();

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent): void => {
      if (!isNotificationClickHandoff(event.data)) return;
      if (event.data.chatId) selectChat(event.data.chatId);
      if (event.data.callId && event.data.answer) accept(event.data.callId);
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [selectChat, accept]);
}
