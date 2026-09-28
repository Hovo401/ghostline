import type { UserPublicProfile } from "@ghostline/contracts";
import { create } from "zustand";

/**
 * The access token + current user, held in memory only (never
 * `localStorage`/cookies — FR-AUTH-06 keeps the refresh token as the sole
 * persisted credential, in an httpOnly cookie the browser manages).
 * `http-client.ts` reads the token to attach `Authorization`; the socket
 * client and the `/app` route guard read `status`/`user`.
 *
 * `checking` is the boot state until `entities/session`'s bootstrap either
 * confirms a session (via the refresh cookie) or gives up.
 */
export type SessionStatus = "checking" | "authenticated" | "anonymous";

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  user: UserPublicProfile | null;
}

interface SessionActions {
  setSession: (accessToken: string, user: UserPublicProfile) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState & SessionActions>((set) => ({
  status: "checking",
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => {
    set({ status: "authenticated", accessToken, user });
  },
  clearSession: () => {
    set({ status: "anonymous", accessToken: null, user: null });
  },
}));

/** Non-hook accessor for modules that can't call hooks (fetch/socket setup). */
export function getAccessToken(): string | null {
  return useSessionStore.getState().accessToken;
}
