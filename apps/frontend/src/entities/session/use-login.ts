import type { LoginRequest } from "@ghostline/contracts";
import { useMutation } from "@tanstack/react-query";

import { login } from "../../shared/api/auth-client";
import { useSessionStore } from "../../shared/api/session-store";

/** FR-AUTH-05 — username/password login. */
export function useLogin() {
  const setSession = useSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: (body: LoginRequest) => login(body),
    onSuccess: (data) => {
      setSession(data.accessToken, data.user);
    },
  });
}
