import type { UserPublicProfile } from "@ghostline/contracts";
import type { QueryClient } from "@tanstack/react-query";

import type { ChatListItem } from "./chat.types";
import { CHATS_QUERY_KEY } from "./use-chats";

/** Chats sort the same way the prototype's list does: most recently
 * updated first (REQUIREMENTS §7.4 — `updatedAt` bumps on every new
 * message, mute change, etc.). */
function sortByUpdatedAtDesc(chats: ChatListItem[]): ChatListItem[] {
  return [...chats].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** Inserts or replaces a chat by id and re-sorts — the one place both the
 * `chat:updated` socket handler and open-direct/mute mutations patch the
 * `["chats"]` cache, so they can't drift into different merge logic. */
export function upsertChat(queryClient: QueryClient, chat: ChatListItem): void {
  queryClient.setQueryData<ChatListItem[]>(CHATS_QUERY_KEY, (old) => {
    const rest = (old ?? []).filter((c) => c.id !== chat.id);
    return sortByUpdatedAtDesc([chat, ...rest]);
  });
}

export function removeChat(queryClient: QueryClient, chatId: string): void {
  queryClient.setQueryData<ChatListItem[]>(CHATS_QUERY_KEY, (old) =>
    (old ?? []).filter((c) => c.id !== chatId),
  );
}

/** `presence` only carries `{ userId, online, lastSeenAt }` — patch every
 * chat whose peer matches instead of waiting for a `chat:updated` that
 * presence changes don't trigger. */
export function patchPeerOnline(queryClient: QueryClient, userId: string, online: boolean): void {
  queryClient.setQueryData<ChatListItem[]>(CHATS_QUERY_KEY, (old) =>
    (old ?? []).map((c) => (c.peer?.id === userId ? { ...c, peer: { ...c.peer, online } } : c)),
  );
}

/** `user:updated` (F5 — settings' profile tab save) carries the full public
 * profile, not just the fields that changed; patch every chat whose peer
 * matches so `ChatListRow`/`ProfilePanel` show the new name/username live
 * instead of waiting for the next `GET /chats` refetch. `ChatListItem.peer`
 * is its own (slimmer) shape, not `UserPublicProfile` itself, so this picks
 * just the fields it carries rather than spreading the whole payload. */
export function patchPeerProfile(queryClient: QueryClient, profile: UserPublicProfile): void {
  queryClient.setQueryData<ChatListItem[]>(CHATS_QUERY_KEY, (old) =>
    (old ?? []).map((c) =>
      c.peer?.id === profile.id
        ? {
            ...c,
            peer: {
              ...c.peer,
              username: profile.username,
              displayName: profile.displayName,
              avatarKey: profile.avatarKey,
              avatarUrl: profile.avatarUrl,
            },
          }
        : c,
    ),
  );
}
