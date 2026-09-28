import { UserSearchResponseSchema } from "@ghostline/contracts";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";

import type { UserPublicProfile } from "./user.types";

/**
 * Backs the "Новый" chat search (FR-USER-02) — `GET /users/search`. Only
 * fires once the query is long enough to be worth a request; the caller
 * (features/chat's NewChatModal) is responsible for debouncing keystrokes.
 */
export function useUserSearch(query: string) {
  const trimmed = query.trim();
  return useQuery<UserPublicProfile[]>({
    queryKey: ["users", "search", trimmed],
    queryFn: async () => {
      const data = await apiFetch("/users/search", { searchParams: { q: trimmed } });
      return UserSearchResponseSchema.parse(data);
    },
    enabled: trimmed.length >= 2,
  });
}
