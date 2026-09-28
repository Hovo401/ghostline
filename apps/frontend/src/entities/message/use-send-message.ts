import {
  MessageSchema,
  type Attachment,
  type MessageType,
  type SendMessageRequest,
} from "@ghostline/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";
import { messagesQueryKey } from "../../shared/api/query-keys";
import { useCurrentUserId } from "../user/use-current-user-id";

import { type MessagesData, upsertMessage } from "./message-cache";
import type { ChatMessage } from "./message.types";

interface SendTextVariables {
  clientMessageId: string;
  text: string;
}

/** A media send always carries the already-uploaded `Attachment` (not just
 * its id) so the optimistic bubble can render the real image/file/waveform
 * immediately instead of waiting for the POST response. */
interface SendMediaVariables {
  clientMessageId: string;
  type: Exclude<MessageType, "text">;
  attachment: Attachment;
  durationMs?: number;
  waveform?: number[];
}

type SendVariables = SendTextVariables | SendMediaVariables;

function isMediaSend(variables: SendVariables): variables is SendMediaVariables {
  return "attachment" in variables;
}

/**
 * Optimistic send (FR-MSG-08), text or media: the message appears
 * immediately with `pending: true` — for media, `attachment` (image/file/
 * voice/video, already uploaded by the caller via `useUploadAttachment`)
 * renders straight away instead of waiting for the round trip — then
 * either gets replaced by the real `Message` the POST responds with (also
 * deduped against the `message:new` echo by `clientMessageId` in
 * message-cache.ts), or flips to `failed: true` so the composer/bubble can
 * offer a retry (FR-MSG-07) instead of losing the draft/upload.
 */
export function useSendMessage(chatId: string) {
  const queryClient = useQueryClient();
  const currentUserId = useCurrentUserId();

  const mutation = useMutation<ChatMessage, Error, SendVariables>({
    mutationFn: async (variables) => {
      const body: SendMessageRequest = isMediaSend(variables)
        ? {
            chatId,
            clientMessageId: variables.clientMessageId,
            type: variables.type,
            attachmentId: variables.attachment.id,
            durationMs: variables.durationMs,
            waveform: variables.waveform,
          }
        : {
            chatId,
            clientMessageId: variables.clientMessageId,
            type: "text",
            text: variables.text,
          };
      const data = await apiFetch("/messages", { method: "POST", body });
      return MessageSchema.parse(data);
    },
    onMutate: (variables) => {
      if (!currentUserId) return;
      const media = isMediaSend(variables);
      const optimistic: ChatMessage = {
        id: variables.clientMessageId,
        chatId,
        seq: BigInt(Date.now()),
        senderId: currentUserId,
        clientMessageId: variables.clientMessageId,
        type: media ? variables.type : "text",
        text: media ? null : variables.text,
        attachmentId: media ? variables.attachment.id : null,
        attachment: media ? variables.attachment : null,
        durationMs: media ? (variables.durationMs ?? null) : null,
        waveform: media ? (variables.waveform ?? null) : null,
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

  const sendMedia = (params: {
    type: Exclude<MessageType, "text">;
    attachment: Attachment;
    durationMs?: number;
    waveform?: number[];
  }): void => {
    mutation.mutate({ clientMessageId: crypto.randomUUID(), ...params });
  };

  const retry = (message: ChatMessage): void => {
    if (message.type === "text") {
      if (!message.text) return;
      mutation.mutate({ clientMessageId: message.clientMessageId, text: message.text });
      return;
    }
    if (!message.attachment) return;
    mutation.mutate({
      clientMessageId: message.clientMessageId,
      type: message.type,
      attachment: message.attachment,
      durationMs: message.durationMs ?? undefined,
      waveform: message.waveform ?? undefined,
    });
  };

  return { send, sendMedia, retry };
}
