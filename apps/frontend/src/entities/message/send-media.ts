import { MessageSchema, type Attachment, type MessageType } from "@ghostline/contracts";
import type { QueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";
import { messagesQueryKey } from "../../shared/api/query-keys";

import { type MessagesData, upsertMessage } from "./message-cache";

export interface SendMediaParams {
  chatId: string;
  clientMessageId: string;
  type: Exclude<MessageType, "text">;
  attachment: Attachment;
  durationMs?: number;
  waveform?: number[];
  /** A caption typed alongside the file in `AttachPreviewDialog` — the wire
   * format allows `text` on a media message same as a caption (T-032
   * §4.4), it just isn't required the way it is for `type: "text"`. */
  caption?: string;
}

/**
 * The `POST /messages` + cache-upsert half of a media send, pulled out of
 * `use-send-message.ts`'s mutation so `features/chat`'s upload-queue runner
 * can call it directly. The runner fires this from
 * `upload-queue-store.enqueue`'s `onDone`, once an upload finishes — which
 * can be long after the `Composer` (and the `useSendMessage(chatId)`
 * instance it would otherwise use) that started the upload has unmounted,
 * e.g. after navigating to a different chat.
 */
export async function sendMediaAttachment(
  queryClient: QueryClient,
  params: SendMediaParams,
): Promise<void> {
  try {
    const data = await apiFetch("/messages", {
      method: "POST",
      body: {
        chatId: params.chatId,
        clientMessageId: params.clientMessageId,
        type: params.type,
        text: params.caption,
        attachmentId: params.attachment.id,
        durationMs: params.durationMs,
        waveform: params.waveform,
      },
    });
    const message = MessageSchema.parse(data);
    upsertMessage(queryClient, params.chatId, message);
  } catch {
    queryClient.setQueryData<MessagesData>(messagesQueryKey(params.chatId), (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) =>
          page.map((m) =>
            m.clientMessageId === params.clientMessageId
              ? { ...m, pending: false, failed: true }
              : m,
          ),
        ),
      };
    });
  }
}
