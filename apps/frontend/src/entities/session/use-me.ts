import { useQuery } from "@tanstack/react-query";

import { fetchMe } from "../../shared/api/auth-client";
import { ME_QUERY_KEY } from "../../shared/api/query-keys";
import { useSessionStore } from "../../shared/api/session-store";

/** `GET /me` — the settings screen's profile tab (FR-USER-01/07/08): unlike
 * `session-store`'s `user` (the leaner `UserPublicProfile` from login/
 * refresh), this carries the privacy toggles (`showOnline`/`readReceipts`)
 * only `/me` returns. */
export function useMe() {
  const status = useSessionStore((state) => state.status);
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    enabled: status === "authenticated",
  });
}
