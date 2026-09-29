import { useQuery } from "@tanstack/react-query";

import { checkUsernameAvailability } from "../../shared/api/auth-client";
import { usernameAvailabilityQueryKey } from "../../shared/api/query-keys";

/** Below this length the backend would reject it anyway (RegisterRequestSchema) — no point asking. */
export const MIN_USERNAME_LENGTH = 3;

/**
 * FR-AUTH-04 — live username-availability check. `username` should already
 * be debounced by the caller (the auth feature waits ~400ms after the last
 * keystroke) so this doesn't fire a request per keystroke.
 */
export function useUsernameAvailability(username: string) {
  return useQuery({
    queryKey: usernameAvailabilityQueryKey(username),
    queryFn: () => checkUsernameAvailability(username),
    enabled: username.length >= MIN_USERNAME_LENGTH,
    staleTime: 30_000,
    retry: false,
  });
}
