/**
 * JWT claim shapes for the two token kinds this module issues. Not a
 * `packages/contracts` schema: the frontend only ever treats the access
 * token as an opaque bearer string and the refresh token as an opaque
 * httpOnly cookie value — it never inspects these claims itself.
 */

export interface AccessTokenPayload {
  sub: string;
  /**
   * The login session (`Session.id`) this token was issued under — lets a
   * route tie per-device state (an Android app's push registration,
   * docs/adr/0017) to the session, so logging out removes it. Optional only
   * for tokens minted before it existed; those expire within the 15 min TTL.
   */
  sid?: string;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Session row id — one row per login, rotated in place on refresh. */
  sid: string;
  /** Stable across rotations of the same login; reuse detection revokes it. */
  familyId: string;
  /**
   * Random per issuance. Without it, rotating within the same wall-clock
   * second (`iat` has 1s resolution) would sign byte-identical tokens for
   * the same `sub`/`sid`/`familyId` — breaking both "the new token differs
   * from the old one" and reuse detection (a replayed "old" token would
   * still match the rotated hash).
   */
  jti: string;
}

export type RefreshTokenClaims = Omit<RefreshTokenPayload, "jti">;

/** ~15 min per REQUIREMENTS.md FR-AUTH-06. */
export const ACCESS_TOKEN_TTL = "15m";
/** Refresh cookie lifetime; matches `Session.expiresAt` on issue/rotation. */
export const REFRESH_TOKEN_TTL = "30d";
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
