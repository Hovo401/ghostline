import { refreshSession } from "../../shared/api/auth-client";
import { setSessionRefresher, useSessionStore } from "../../shared/api/session-store";

// Registered once, at module load, so `http-client.ts`'s 401 retry can mint
// a fresh access token without importing `auth-client.ts` directly (that
// would be a circular import — see `session-store.ts`'s `getSessionRefresher`).
setSessionRefresher(refreshSession);

let pending: Promise<void> | null = null;

/**
 * Resolves the session store out of its initial `checking` state exactly
 * once per page load: tries to mint a fresh access token from the httpOnly
 * refresh cookie (FR-AUTH-06), then flips to `authenticated`/`anonymous`.
 * Route `beforeLoad` guards (`/login`, `/app`) await this so a reload keeps
 * (or correctly drops) the session before the guard makes its redirect
 * decision — see `routes/app.tsx`/`routes/login.tsx`.
 */
export function ensureSession(): Promise<void> {
  if (useSessionStore.getState().status !== "checking") return Promise.resolve();

  pending ??= refreshSession()
    .then((data) => {
      useSessionStore.getState().setSession(data.accessToken, data.user);
    })
    .catch(() => {
      useSessionStore.getState().clearSession();
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}
