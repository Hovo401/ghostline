import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../shared/api/http-client";
import { CHATS_QUERY_KEY } from "../../shared/api/query-keys";

/** Profile panel's "Заблокировать" row — `POST /users/:id/block`
 * (FR-USER-05). The backend removes the direct chat as a side effect and
 * pushes `chat:removed`; refetching here too covers the (likely) case
 * where that arrives before this mutation's own promise resolves. */
export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await apiFetch(`/users/${userId}/block`, { method: "POST" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY });
    },
  });
}
