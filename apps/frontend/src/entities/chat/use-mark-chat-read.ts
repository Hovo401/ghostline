import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";

import type { ChatListItem } from "./chat.types";
import { CHATS_QUERY_KEY } from "./use-chats";

/** `POST /chats/:id/read` — called when a thread is opened and whenever a
 * new incoming message arrives while it's the active chat (FR-RT-04). Zeroes
 * the unread badge optimistically; the peer's `read:updated` reflects back
 * as our own messages flipping to "прочитано" (see use-message-realtime). */
export function useMarkChatRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: string) => {
      // `body: {}` — MarkReadRequestSchema is all-optional, but without a
      // JSON body the request has no Content-Type and the backend's zod
      // pipe rejects `undefined` where it expects an object (400).
      await apiFetch(`/chats/${chatId}/read`, { method: "POST", body: {} });
    },
    onMutate: (chatId: string) => {
      queryClient.setQueryData<ChatListItem[]>(CHATS_QUERY_KEY, (old) =>
        (old ?? []).map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)),
      );
    },
  });
}
