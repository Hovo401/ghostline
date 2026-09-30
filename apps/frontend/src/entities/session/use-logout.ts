import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logout } from "../../shared/api/auth-client";
import { useSessionStore } from "../../shared/api/session-store";

/**
 * Ends the session on the server, then drops everything cached for this
 * account on the device. Local state is cleared even if the request fails —
 * the user asked to be signed out, a network error shouldn't keep them in.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const clearSession = useSessionStore((state) => state.clearSession);

  return useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      clearSession();
      queryClient.clear();
    },
  });
}
