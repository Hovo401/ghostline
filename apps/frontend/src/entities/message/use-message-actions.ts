import { MessageSchema, type EditMessageRequest } from "@ghostline/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";
import { useToastStore } from "../../shared/ui/toast-store";

import { removeMessage, upsertMessage } from "./message-cache";
import type { ChatMessage } from "./message.types";

interface EditVariables {
  message: ChatMessage;
  text: string;
}

/**
 * `PATCH /messages/:id` (FR-MSG-05) — optimistic: the bubble shows the new
 * text and "изменено" at once, rolls back to `message` if the request fails.
 * Other members (and this user's other tabs) get it via `message:updated`.
 */
export function useEditMessage() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  return useMutation<ChatMessage, Error, EditVariables>({
    mutationFn: async ({ message, text }) => {
      const body: EditMessageRequest = { text };
      const data = await apiFetch(`/messages/${message.id}`, { method: "PATCH", body });
      return MessageSchema.parse(data);
    },
    onMutate: ({ message, text }) => {
      upsertMessage(queryClient, message.chatId, {
        ...message,
        text,
        editedAt: new Date().toISOString(),
      });
    },
    onSuccess: (updated) => {
      upsertMessage(queryClient, updated.chatId, updated);
    },
    onError: (_error, { message }) => {
      upsertMessage(queryClient, message.chatId, message);
      pushToast({ variant: "error", message: "Не удалось изменить сообщение" });
    },
  });
}

/**
 * `DELETE /messages/:id` (FR-MSG-06, "delete for everyone") — optimistic:
 * the bubble disappears at once and comes back if the request fails. The
 * chat list preview follows from the backend's `chat:updated`.
 */
export function useDeleteMessage() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);

  return useMutation<unknown, Error, ChatMessage>({
    mutationFn: (message) => apiFetch(`/messages/${message.id}`, { method: "DELETE" }),
    onMutate: (message) => {
      removeMessage(queryClient, message.chatId, message.id);
    },
    onError: (_error, message) => {
      upsertMessage(queryClient, message.chatId, message);
      pushToast({ variant: "error", message: "Не удалось удалить сообщение" });
    },
  });
}
