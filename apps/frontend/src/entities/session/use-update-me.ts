import type { MeResponse, UpdateMeRequest } from "@ghostline/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateMe } from "../../shared/api/auth-client";
import { ME_QUERY_KEY } from "../../shared/api/query-keys";
import { useSessionStore } from "../../shared/api/session-store";

/**
 * `PATCH /me` — settings' profile tab "Сохранить" (FR-USER-01/04/08).
 * Patches both this device's `["me"]` cache and `session-store`'s `user`
 * (read by `Chat.tsx`'s rail avatar and anywhere else that shows "you"),
 * so the save is visible immediately without waiting for the `user:updated`
 * echo over the socket.
 */
export function useUpdateMe() {
  const queryClient = useQueryClient();
  const updateSessionUser = useSessionStore((state) => state.updateUser);

  return useMutation({
    mutationFn: (body: UpdateMeRequest) => updateMe(body),
    onSuccess: (me: MeResponse) => {
      queryClient.setQueryData<MeResponse>(ME_QUERY_KEY, me);
      updateSessionUser(me);
    },
  });
}
