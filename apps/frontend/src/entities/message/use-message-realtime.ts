import type { MessageDeletedPayload, ReadUpdatedPayload } from "@ghostline/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getSocketClient } from "../../shared/api/socket-client";
import { useCurrentUserId } from "../user/use-current-user-id";

import { useFreshMessageStore } from "./fresh-message-store";
import { markReadUpTo, removeMessage, upsertMessage } from "./message-cache";
import type { ChatMessage } from "./message.types";

/** Subscribes `message:new`/`message:updated`/`message:deleted`/
 * `read:updated` into the `["messages", chatId]` caches — mount once
 * (features/chat's entry point) alongside `useChatRealtime`, per
 * apps/frontend/CLAUDE.md's realtime rule. */
export function useMessageRealtime(): void {
  const queryClient = useQueryClient();
  const currentUserId = useCurrentUserId();

  useEffect(() => {
    const socket = getSocketClient();

    const handleNewOrUpdated = (message: ChatMessage): void => {
      upsertMessage(queryClient, message.chatId, message);
    };
    const handleNew = (message: ChatMessage): void => {
      if (message.attachment) useFreshMessageStore.getState().mark(message.id);
      handleNewOrUpdated(message);
    };
    const handleDeleted = (payload: MessageDeletedPayload): void => {
      removeMessage(queryClient, payload.chatId, payload.messageId);
    };
    const handleReadUpdated = (payload: ReadUpdatedPayload): void => {
      markReadUpTo(queryClient, payload.chatId, payload.userId, currentUserId, payload.lastReadSeq);
    };

    socket.on("message:new", handleNew);
    socket.on("message:updated", handleNewOrUpdated);
    socket.on("message:deleted", handleDeleted);
    socket.on("read:updated", handleReadUpdated);
    return () => {
      socket.off("message:new", handleNew);
      socket.off("message:updated", handleNewOrUpdated);
      socket.off("message:deleted", handleDeleted);
      socket.off("read:updated", handleReadUpdated);
    };
  }, [queryClient, currentUserId]);
}
