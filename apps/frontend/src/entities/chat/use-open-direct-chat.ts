import { ChatListItemSchema, type OpenDirectRequest } from "@ghostline/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";

import { upsertChat } from "./chat-cache";
import type { ChatListItem } from "./chat.types";

/** "Новый" → pick a user → `POST /chats/open-direct` (FR-CHAT-01), creating
 * (or reusing) the direct chat before the first message is sent. */
export function useOpenDirectChat() {
  const queryClient = useQueryClient();
  return useMutation<ChatListItem, Error, OpenDirectRequest>({
    mutationFn: async (body) => {
      const data: unknown = await apiFetch("/chats/open-direct", { method: "POST", body });
      return ChatListItemSchema.parse(data);
    },
    onSuccess: (chat) => {
      upsertChat(queryClient, chat);
    },
  });
}
