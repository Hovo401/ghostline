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
 * confirms a session (via the refresh cookie) or gives up. `reconnecting`
 * is true while `checking` and the bootstrap is retrying after a transient
 * failure (no network / 5xx), so the pending screen can say so instead of
 * staying blank; `setSession`/`clearSession` reset it.
 */
export type SessionStatus = "checking" | "authenticated" | "anonymous";

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  user: UserPublicProfile | null;
  reconnecting: boolean;
}

interface SessionActions {
  setSession: (accessToken: string, user: UserPublicProfile) => void;
  clearSession: () => void;
  setReconnecting: () => void;
  /** Patches the cached profile in place — `entities/session`'s
   * `useUpdateMe` (after a `PATCH /me`) and `useMeRealtime` (after a
   * `user:updated` push for this device's own user) both go through this
   * instead of `setSession`, since neither has a fresh access token to
   * pass it. */
  updateUser: (user: UserPublicProfile) => void;
}

export const useSessionStore = create<SessionState & SessionActions>((set) => ({
  status: "checking",
  accessToken: null,
  user: null,
  reconnecting: false,
  setSession: (accessToken, user) => {
    set({ status: "authenticated", accessToken, user, reconnecting: false });
  },
  clearSession: () => {
    set({ status: "anonymous", accessToken: null, user: null, reconnecting: false });
  },
  setReconnecting: () => {
    set({ reconnecting: true });
  },
  updateUser: (user) => {
    set({ user });
  },
}));

/** Non-hook accessor for modules that can't call hooks (fetch/socket setup). */
export function getAccessToken(): string | null {
  return useSessionStore.getState().accessToken;
}

export interface SessionRefreshResult {
  accessToken: string;
  user: UserPublicProfile;
}

/**
 * The `/auth/refresh` call, injected here by `entities/session`'s bootstrap
 * module rather than imported directly by `http-client.ts` — `auth-client.ts`
 * (where the real call lives) itself imports `apiFetch` from `http-client.ts`,
 * so a static import the other way would be a circular import between the
 * two `shared/api` modules (`import-x/no-cycle`). `http-client.ts`'s 401
 * retry calls `getSessionRefresher()` instead.
 */
let sessionRefresher: (() => Promise<SessionRefreshResult>) | null = null;

export function setSessionRefresher(refresher: () => Promise<SessionRefreshResult>): void {
  sessionRefresher = refresher;
}

export function getSessionRefresher(): (() => Promise<SessionRefreshResult>) | null {
  return sessionRefresher;
}
