import type {
  DeliveredUpdatedPayload,
  MessageDeletedPayload,
  ReadUpdatedPayload,
} from "@ghostline/contracts";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { CHATS_QUERY_KEY } from "../../shared/api/query-keys";
import { getSocketClient } from "../../shared/api/socket-client";
import { useCurrentUserId } from "../user/use-current-user-id";

import { useFreshMessageStore } from "./fresh-message-store";
import {
  flattenMessages,
  markDeliveredUpTo,
  markReadUpTo,
  removeMessage,
  upsertMessage,
  type MessagesData,
} from "./message-cache";
import type { ChatMessage } from "./message.types";
import { fetchMessagesAfter } from "./use-messages";

async function catchUp(queryClient: QueryClient): Promise<void> {
  const caches = queryClient.getQueriesData<MessagesData>({ queryKey: ["messages"] });
  await Promise.all(
    caches.map(async ([key, data]) => {
      const chatId = key[1];
      const newest = flattenMessages(data).at(-1);
      if (typeof chatId !== "string" || !newest) return;
      try {
        for (const message of await fetchMessagesAfter(chatId, newest.seq)) {
          if (message.deletedAt) removeMessage(queryClient, chatId, message.id);
          else upsertMessage(queryClient, chatId, message);
        }
      } catch {
        // Best effort: the next refetch/focus brings the chat up to date.
      }
    }),
  );
  void queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY });
}

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
      // A missed-call row is written by the worker, which can't push a
      // per-viewer `chat:updated` — refetch the list so the chat rises to
      // the top with the right preview/unread count.
      if (message.type === "call")
        void queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY });
    };
    const handleDeleted = (payload: MessageDeletedPayload): void => {
      removeMessage(queryClient, payload.chatId, payload.messageId);
    };
    const handleReadUpdated = (payload: ReadUpdatedPayload): void => {
      markReadUpTo(queryClient, payload.chatId, payload.userId, currentUserId, payload.lastReadSeq);
    };
    const handleDeliveredUpdated = (payload: DeliveredUpdatedPayload): void => {
      markDeliveredUpTo(
        queryClient,
        payload.chatId,
        payload.userId,
        currentUserId,
        payload.lastDeliveredSeq,
      );
    };

    // Anything sent/edited/deleted while the socket was down never reached
    // the caches — after a *re*connect, pull what's newer than each loaded
    // chat's latest message (the first connect has nothing to catch up on).
    let hasConnected = socket.connected;
    const handleConnect = (): void => {
      if (!hasConnected) {
        hasConnected = true;
        return;
      }
      void catchUp(queryClient);
    };

    socket.on("connect", handleConnect);
    socket.on("message:new", handleNew);
    socket.on("message:updated", handleNewOrUpdated);
    socket.on("message:deleted", handleDeleted);
    socket.on("read:updated", handleReadUpdated);
    socket.on("delivered:updated", handleDeliveredUpdated);
    return () => {
      socket.off("connect", handleConnect);
      socket.off("message:new", handleNew);
      socket.off("message:updated", handleNewOrUpdated);
      socket.off("message:deleted", handleDeleted);
      socket.off("read:updated", handleReadUpdated);
      socket.off("delivered:updated", handleDeliveredUpdated);
    };
  }, [queryClient, currentUserId]);
}
