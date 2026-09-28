/**
 * Query key builders shared across `entities/*` — entities can't import
 * each other (see apps/frontend/CLAUDE.md's layering table), but
 * `use-block-user.ts` (entities/user) still needs to invalidate the same
 * `["chats"]` cache `entities/chat` owns. Keeping the keys here instead of
 * duplicating the literal in both places is the one shared source of truth.
 */
export const CHATS_QUERY_KEY = ["chats"] as const;

export function messagesQueryKey(chatId: string) {
  return ["messages", chatId] as const;
}

export function userSearchQueryKey(query: string) {
  return ["users", "search", query] as const;
}

export function usernameAvailabilityQueryKey(username: string) {
  return ["users", "availability", username] as const;
}
