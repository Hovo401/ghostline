import { refreshSession } from "../../shared/api/auth-client";
import { useSessionStore } from "../../shared/api/session-store";

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
