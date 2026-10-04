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

/** Reconnect re-sync of the newest history page: edits, reactions and deletes
 * of already-cached messages don't advance `seq`, so `afterSeq` can't see
 * them. Confirmed messages within the page's seq range that the server no
 * longer returns were deleted while offline and are dropped; every server
 * message is merged via `upsertMessage`. Optimistic bubbles (`pending`/
 * `failed`) and messages newer than the page are never touched. A socket
 * update landing mid-fetch may be overwritten by the snapshot until the next
 * event/reload (accepted, T-074 scope); older pages are not gap-filled. */
export function reconcileNewestPage(
  queryClient: QueryClient,
  chatId: string,
  serverPage: ChatMessage[],
): void {
  const first = serverPage[0];
  const last = serverPage.at(-1);
  if (!first || !last) return;
  const serverIds = new Set(serverPage.map((m) => m.id));
  queryClient.setQueryData<MessagesData>(messagesQueryKey(chatId), (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page) =>
        page.filter(
          (m) =>
            m.pending === true ||
            m.failed === true ||
            m.seq < first.seq ||
            m.seq > last.seq ||
            serverIds.has(m.id),
        ),
      ),
    };
  });
  for (const message of serverPage) upsertMessage(queryClient, chatId, message);
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
