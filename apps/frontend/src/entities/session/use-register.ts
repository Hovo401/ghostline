import type { RegisterRequest } from "@ghostline/contracts";
import { useMutation } from "@tanstack/react-query";

import { register } from "../../shared/api/auth-client";
import { useSessionStore } from "../../shared/api/session-store";

/**
 * FR-AUTH-01 — one-step registration (username + password; the recovery
 * phrase step, FR-AUTH-13–16/T-002, and a separate display-name field are
 * out of the MVP build per docs/tasks/BACKLOG.md's "Отложено" — the display
 * name defaults to the username and is editable later in profile settings).
 */
export function useRegister() {
  const setSession = useSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: (body: RegisterRequest) => register(body),
    onSuccess: (data) => {
      setSession(data.accessToken, data.user);
    },
  });
}
