import { getAccessToken } from "./session-store";

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
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  searchParams?: Record<string, string>;
}

/**
 * Thin fetch wrapper: same-origin `/api/v1` base, credentials for the
 * httpOnly refresh cookie (FR-AUTH-06), and the in-memory access token from
 * `session-store` as a bearer header. Returns unparsed JSON — callers
 * validate the shape with the matching zod schema from `@ghostline/contracts`
 * (the wire format's one source of truth), rather than trusting a cast.
 */
export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  const token = getAccessToken();
  const response = await fetch(url, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new ApiError(response.status, message || response.statusText);
  }
  if (response.status === 204) return undefined;
  return response.json() as Promise<unknown>;
}
