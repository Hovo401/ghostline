import { MessageSchema } from "@ghostline/contracts";
import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";
import { messagesQueryKey } from "../../shared/api/query-keys";

import { flattenMessages } from "./message-cache";
import type { ChatMessage } from "./message.types";

/** `zod` isn't a direct dependency here (only `@ghostline/contracts` is) —
 * validating element-by-element with the schema it already exports avoids
 * pulling `z.array` in just for this. */
function parseMessagePage(data: unknown): ChatMessage[] {
  if (!Array.isArray(data)) throw new Error("expected an array of messages");
  return data.map((item) => MessageSchema.parse(item));
}

async function fetchMessagePage(chatId: string, beforeSeq: string | undefined) {
  const data = await apiFetch("/messages", {
    searchParams: beforeSeq ? { chatId, beforeSeq } : { chatId },
  });
  return parseMessagePage(data);
}

/** Everything newer than `afterSeq`, oldest first — reconnect catch-up
 * (FR-RT-05). Deleted rows are included so the caller can drop them. */
export async function fetchMessagesAfter(chatId: string, afterSeq: bigint): Promise<ChatMessage[]> {
  const data = await apiFetch("/messages", {
    searchParams: { chatId, afterSeq: afterSeq.toString() },
  });
  return parseMessagePage(data);
}

/**
 * A chat's messages, oldest → newest, paginated backwards from "now" via
 * `beforeSeq` (REQUIREMENTS.md §7.4). `fetchNextPage` loads the next older
 * page — the feed's "Load earlier" affordance drives that, there's no
 * scroll-position magic here.
 */
export function useMessages(chatId: string | undefined) {
  const query = useInfiniteQuery<
    ChatMessage[],
    Error,
    InfiniteData<ChatMessage[], string | undefined>,
    ReturnType<typeof messagesQueryKey>,
    string | undefined
  >({
    queryKey: messagesQueryKey(chatId ?? ""),
    queryFn: ({ pageParam }) => fetchMessagePage(chatId ?? "", pageParam),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      const oldest = lastPage[0];
      return oldest ? oldest.seq.toString() : undefined;
    },
    enabled: chatId !== undefined,
  });

  return { ...query, messages: flattenMessages(query.data) };
}
