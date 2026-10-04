import { getAccessToken, getSessionRefresher, useSessionStore } from "./session-store";

// Reached through nginx (docker/nginx/dev.conf) `location /api/` → the Nest
// backend, which sets its global prefix to "api/v1" (see main.ts) — same
// origin as the app, so the refresh-token cookie rides every request.
const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  searchParams?: Record<string, string>;
}

function buildUrl(path: string, searchParams: Record<string, string> | undefined): URL {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function doFetch(url: URL, options: ApiFetchOptions, token: string | null): Promise<Response> {
  return fetch(url, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

// Dedupes concurrent 401s (a media upload's long-lived request and any other
// in-flight call) into a single `/auth/refresh` round trip instead of each
// retrying it independently.
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Mints a fresh access token from the httpOnly refresh cookie, via the
 * refresher `entities/session/session-bootstrap.ts` registers on
 * `session-store` — not a direct import of `auth-client.ts`'s
 * `refreshSession`, since that module itself imports `apiFetch` from this
 * file and a static import the other way would be a circular import
 * between the two `shared/api` modules. Resolves `null` if nothing
 * registered a refresher yet (shouldn't happen once the app has booted) or
 * the refresh itself fails (the session is cleared only when the server answered 401).
 */
async function refreshAccessToken(): Promise<string | null> {
  const refresher = getSessionRefresher();
  if (!refresher) return null;

  refreshInFlight ??= refresher()
    .then((data) => {
      useSessionStore.getState().setSession(data.accessToken, data.user);
      return data.accessToken;
    })
    .catch((error: unknown) => {
      // Only the server rejecting the refresh cookie ends the session — a network blip or a 5xx
      // must not log the user out (the request just fails and gets retried).
      if (error instanceof ApiError && error.status === 401) {
        useSessionStore.getState().clearSession();
      }
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/**
 * Thin fetch wrapper: same-origin `/api/v1` base, credentials for the
 * httpOnly refresh cookie (FR-AUTH-06), and the in-memory access token from
 * `session-store` as a bearer header. Returns unparsed JSON — callers
 * validate the shape with the matching zod schema from `@ghostline/contracts`
 * (the wire format's one source of truth), rather than trusting a cast.
 *
 * On a 401, retries once after a `/auth/refresh` — a long media upload can
 * easily outlive the 15-minute access token between the presign call and
 * `/complete`, and without this the whole upload would fail right at the
 * finish line instead of transparently minting a new token.
 */
export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<unknown> {
  const url = buildUrl(path, options.searchParams);
  const response = await doFetch(url, options, getAccessToken());

  if (response.status === 401 && path !== "/auth/refresh") {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryResponse = await doFetch(url, options, newToken);
      if (!retryResponse.ok) {
        const message = await retryResponse.text().catch(() => retryResponse.statusText);
        throw new ApiError(retryResponse.status, message || retryResponse.statusText);
      }
      if (retryResponse.status === 204) return undefined;
      return retryResponse.json() as Promise<unknown>;
    }
  }

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new ApiError(response.status, message || response.statusText);
  }
  if (response.status === 204) return undefined;
  return response.json() as Promise<unknown>;
}
