import type { AppConfigService } from "../config/app-config.service";

import { REFRESH_TOKEN_TTL_MS } from "./token.types";

/**
 * The refresh token lives in an httpOnly cookie (FR-AUTH-06), scoped to the
 * `/api/v1/auth` routes that actually need it. Reading it back doesn't need
 * the `cookie-parser` middleware — `Cookie` is a single request header and
 * splitting it is a few lines, not a dependency. No `@types/express` in this
 * project either, so this narrows `@Req()`/`@Res()` to the two shapes it
 * actually uses instead of importing express's own types.
 */
export const REFRESH_COOKIE_NAME = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

export interface CookieRequest {
  headers: { cookie?: string };
}

interface CookieOptionsLike {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

export interface CookieResponse {
  cookie(name: string, value: string, options: CookieOptionsLike): unknown;
  clearCookie(name: string, options: CookieOptionsLike): unknown;
}

function cookieOptions(config: AppConfigService): CookieOptionsLike {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}

export function setRefreshCookie(
  res: CookieResponse,
  config: AppConfigService,
  token: string,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions(config));
}

export function clearRefreshCookie(res: CookieResponse, config: AppConfigService): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions(config));
}

export function readRefreshCookie(req: CookieRequest): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const name = part.slice(0, separatorIndex).trim();
    if (name === REFRESH_COOKIE_NAME) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }
  }
  return undefined;
}
