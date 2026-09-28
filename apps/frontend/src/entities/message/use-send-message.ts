import { MessageSchema, type SendMessageRequest } from "@ghostline/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";
import { messagesQueryKey } from "../../shared/api/query-keys";
import { useCurrentUserId } from "../user/use-current-user-id";

import { type MessagesData, upsertMessage } from "./message-cache";
import type { ChatMessage } from "./message.types";

interface SendVariables {
  clientMessageId: string;
  text: string;
}

/**
 * Optimistic text send (FR-MSG-08): the message appears immediately with
 * `pending: true`, then either gets replaced by the real `Message` the POST
 * responds with (also deduped against the `message:new` echo by
 * `clientMessageId` in message-cache.ts), or flips to `failed: true` so the
 * composer/bubble can offer a retry (FR-MSG-07) instead of losing the draft.
 */
export function useSendMessage(chatId: string) {
  const queryClient = useQueryClient();
  const currentUserId = useCurrentUserId();

  const mutation = useMutation<ChatMessage, Error, SendVariables>({
    mutationFn: async ({ clientMessageId, text }) => {
      const body: SendMessageRequest = { chatId, clientMessageId, type: "text", text };
      const data = await apiFetch("/messages", { method: "POST", body });
      return MessageSchema.parse(data);
    },
    onMutate: ({ clientMessageId, text }) => {
      if (!currentUserId) return;
      const optimistic: ChatMessage = {
        id: clientMessageId,
        chatId,
        seq: BigInt(Date.now()),
        senderId: currentUserId,
        clientMessageId,
        type: "text",
        text,
        attachmentId: null,
        durationMs: null,
        waveform: null,
        replyToId: null,
        status: "sent",
        editedAt: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      upsertMessage(queryClient, chatId, optimistic);
    },
    onSuccess: (message) => {
      upsertMessage(queryClient, chatId, message);
    },
    onError: (_error, { clientMessageId }) => {
      queryClient.setQueryData<MessagesData>(messagesQueryKey(chatId), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((m) =>
              m.clientMessageId === clientMessageId ? { ...m, pending: false, failed: true } : m,
            ),
          ),
        };
      });
    },
  });

  const send = (text: string): void => {
    const trimmed = text.trim();
    if (!trimmed) return;
    mutation.mutate({ clientMessageId: crypto.randomUUID(), text: trimmed });
  };

  const retry = (message: ChatMessage): void => {
    if (!message.text) return;
    mutation.mutate({ clientMessageId: message.clientMessageId, text: message.text });
  };

  return { send, retry };
}
