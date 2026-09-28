import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getSocketClient } from "../../shared/api/socket-client";

import { patchPeerOnline, removeChat, upsertChat } from "./chat-cache";
import type { ChatListItem } from "./chat.types";

/** Keeps the `["chats"]` Query cache in sync with `chat:updated`,
 * `chat:removed` and `presence` — mount once (features/chat's entry point)
 * per apps/frontend/CLAUDE.md's "one copy of server state" rule. */
export function useChatRealtime(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocketClient();

    const handleUpdated = (chat: ChatListItem): void => {
      upsertChat(queryClient, chat);
    };
    const handleRemoved = (payload: { chatId: string }): void => {
      removeChat(queryClient, payload.chatId);
    };
    const handlePresence = (payload: { userId: string; online: boolean }): void => {
      patchPeerOnline(queryClient, payload.userId, payload.online);
    };

    socket.on("chat:updated", handleUpdated);
    socket.on("chat:removed", handleRemoved);
    socket.on("presence", handlePresence);
    return () => {
      socket.off("chat:updated", handleUpdated);
      socket.off("chat:removed", handleRemoved);
      socket.off("presence", handlePresence);
    };
  }, [queryClient]);
}
