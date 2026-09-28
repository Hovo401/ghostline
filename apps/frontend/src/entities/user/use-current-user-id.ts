import { useSessionStore } from "../../shared/api/session-store";

/** The signed-in user's id — feed grouping and "is this my message" checks
 * go through this one hook so they don't each reach into the session store
 * directly. `null` while `session-store`'s status is "checking"/"anonymous". */
export function useCurrentUserId(): string | null {
  return useSessionStore((state) => state.user?.id ?? null);
}
