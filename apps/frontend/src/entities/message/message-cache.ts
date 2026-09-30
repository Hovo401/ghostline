import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import { messagesQueryKey } from "../../shared/api/query-keys";

import type { ChatMessage } from "./message.types";

export type MessagesData = InfiniteData<ChatMessage[], string | undefined>;

function sortBySeq(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0));
}

/** Ascending (oldest → newest) flat list for rendering — pages are stored
 * newest-page-first (`pages[0]` has no `beforeSeq`), so they're reversed
 * before flattening. */
export function flattenMessages(data: MessagesData | undefined): ChatMessage[] {
  if (!data) return [];
  return sortBySeq([...data.pages].reverse().flat());
}

/** Inserts/replaces a message in the newest page by `id` (server messages)
 * or `clientMessageId` (optimistic ones still waiting on their echo) — the
 * one merge used by optimistic send, the POST response and `message:new`/
 * `message:updated`, so they can't disagree on what "the same message"
 * means. */
export function upsertMessage(
  queryClient: QueryClient,
  chatId: string,
  message: ChatMessage,
): void {
  queryClient.setQueryData<MessagesData>(messagesQueryKey(chatId), (old) => {
    const base: MessagesData = old ?? { pages: [[]], pageParams: [undefined] };
    const isMatch = (m: ChatMessage): boolean =>
      m.id === message.id || m.clientMessageId === message.clientMessageId;
    // An edit/update to a message in an older page replaces it where it is —
    // only a genuinely new message joins the newest page.
    const pageIndex = base.pages.findIndex((page) => page.some(isMatch));
    const target = pageIndex === -1 ? 0 : pageIndex;
    const pages = base.pages.map((page, index) =>
      index === target ? sortBySeq([...page.filter((m) => !isMatch(m)), message]) : page,
    );
    return { ...base, pages };
  });
}

export function removeMessage(queryClient: QueryClient, chatId: string, messageId: string): void {
  queryClient.setQueryData<MessagesData>(messagesQueryKey(chatId), (old) => {
    if (!old) return old;
    return { ...old, pages: old.pages.map((page) => page.filter((m) => m.id !== messageId)) };
  });
}

/** `read:updated` (FR-RT-04) doesn't name which messages flipped, just the
 * peer's new `lastReadSeq` — flip every one of *our* messages at or before
 * it across all loaded pages instead of just the newest one. */
export function markReadUpTo(
  queryClient: QueryClient,
  chatId: string,
  readerId: string,
  currentUserId: string | null,
  lastReadSeq: bigint,
): void {
  if (readerId === currentUserId) return;
  queryClient.setQueryData<MessagesData>(messagesQueryKey(chatId), (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page) =>
        page.map((m) =>
          m.senderId === currentUserId && m.seq <= lastReadSeq && m.status !== "read"
            ? { ...m, status: "read" }
            : m,
        ),
      ),
    };
  });
}

/** `delivered:updated` — same shape as `markReadUpTo`, but only ever lifts
 * "sent" to "delivered" (never downgrades a "read"). */
export function markDeliveredUpTo(
  queryClient: QueryClient,
  chatId: string,
  recipientId: string,
  currentUserId: string | null,
  lastDeliveredSeq: bigint,
): void {
  if (recipientId === currentUserId) return;
  queryClient.setQueryData<MessagesData>(messagesQueryKey(chatId), (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page) =>
        page.map((m) =>
          m.senderId === currentUserId && m.seq <= lastDeliveredSeq && m.status === "sent"
            ? { ...m, status: "delivered" }
            : m,
        ),
      ),
    };
  });
}
