import { ChatListItemSchema } from "@ghostline/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";

import { upsertChat } from "./chat-cache";
import type { ChatListItem } from "./chat.types";

export interface MuteChatRequest {
  chatId: string;
  muted: boolean;
}

/** Profile panel's "Без звука" toggle — `PATCH /chats/:id/mute`. The
 * request body is just the one field `ChatListItem` already exposes, so
 * it's typed straight off that contract type instead of a second
 * hand-written shape. */
export function useMuteChat() {
  const queryClient = useQueryClient();
  return useMutation<ChatListItem, Error, MuteChatRequest>({
    mutationFn: async ({ chatId, muted }) => {
      const data: unknown = await apiFetch(`/chats/${chatId}/mute`, {
        method: "PATCH",
        body: { muted },
      });
      return ChatListItemSchema.parse(data);
    },
    onSuccess: (chat) => {
      upsertChat(queryClient, chat);
    },
  });
}
