import type { MeResponse, UserPublicProfile } from "@ghostline/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { ME_QUERY_KEY } from "../../shared/api/query-keys";
import { useSessionStore } from "../../shared/api/session-store";
import { getSocketClient } from "../../shared/api/socket-client";

/**
 * Keeps this device's own `["me"]` cache and `session-store.user` current
 * when a profile edit made on another device/tab pushes `user:updated` for
 * this same user — mount once (features/chat's entry point, alongside
 * `useChatRealtime`) per apps/frontend/CLAUDE.md's realtime rule. Ignores
 * the event for every other user; `entities/chat`'s own `useChatRealtime`
 * is what keeps their `ChatListItem.peer` entries in sync.
 */
export function useMeRealtime(): void {
  const queryClient = useQueryClient();
  const updateSessionUser = useSessionStore((state) => state.updateUser);

  useEffect(() => {
    const socket = getSocketClient();

    const handleUserUpdated = (profile: UserPublicProfile): void => {
      if (profile.id !== useSessionStore.getState().user?.id) return;
      queryClient.setQueryData<MeResponse>(ME_QUERY_KEY, (old) =>
        old ? { ...old, ...profile } : old,
      );
      updateSessionUser(profile);
    };

    socket.on("user:updated", handleUserUpdated);
    return () => {
      socket.off("user:updated", handleUserUpdated);
    };
  }, [queryClient, updateSessionUser]);
}
