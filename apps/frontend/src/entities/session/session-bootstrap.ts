import { refreshSession } from "../../shared/api/auth-client";
import { ApiError } from "../../shared/api/http-client";
import {
  setSessionRefresher,
  useSessionStore,
  type SessionRefreshResult,
} from "../../shared/api/session-store";

const REFRESH_LOCK = "ghostline-auth-refresh";
const MAX_RETRY_DELAY_MS = 10_000;

// Each refresh rotates the refresh token, so two parallel ones (boot + a 401 retry, or two tabs)
// would race the rotation. One in-flight call per tab, and a Web Lock across tabs.
let refreshInFlight: Promise<SessionRefreshResult> | null = null;

async function refreshLocked(): Promise<SessionRefreshResult> {
  if (!("locks" in navigator)) return refreshSession();
  return navigator.locks.request(REFRESH_LOCK, refreshSession);
}

function refreshOnce(): Promise<SessionRefreshResult> {
  const inFlight = (refreshInFlight ??= refreshLocked().finally(() => {
    refreshInFlight = null;
  }));
  return inFlight;
}

// Registered once, at module load, so `http-client.ts`'s 401 retry can mint
// a fresh access token without importing `auth-client.ts` directly (that
// would be a circular import — see `session-store.ts`'s `getSessionRefresher`).
setSessionRefresher(refreshOnce);

/** A failure that says nothing about the session: no network yet, a deploy in progress, throttling. */
function isTransient(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status >= 500 || error.status === 408 || error.status === 429;
  }
  return error instanceof TypeError;
}

function waitBeforeRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      resolve();
    };
    const timer = setTimeout(done, Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS));
    window.addEventListener("online", done);
  });
}

async function resolveSession(): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      const data = await refreshOnce();
      useSessionStore.getState().setSession(data.accessToken, data.user);
      return;
    } catch (error) {
      if (!isTransient(error)) {
        useSessionStore.getState().clearSession();
        return;
      }
      // The server never rejected the cookie, so keep it: a cold start often runs before the
      // network is up, and logging out here is what made the Android app ask for a login.
      await waitBeforeRetry(attempt);
    }
  }
}

let pending: Promise<void> | null = null;

/**
 * Resolves the session store out of its initial `checking` state exactly
 * once per page load: tries to mint a fresh access token from the httpOnly
 * refresh cookie (FR-AUTH-06), then flips to `authenticated`/`anonymous`.
 * Only the server rejecting the cookie makes the user `anonymous`; a network or 5xx failure is
 * retried (with backoff, and at once when the browser goes back online) while the store stays
 * `checking`. Route `beforeLoad` guards (`/login`, `/app`) await this so a reload keeps
 * (or correctly drops) the session before the guard makes its redirect
 * decision — see `routes/app.tsx`/`routes/login.tsx`.
 */
export function ensureSession(): Promise<void> {
  if (useSessionStore.getState().status !== "checking") return Promise.resolve();

  pending ??= resolveSession().finally(() => {
    pending = null;
  });

  return pending;
}
