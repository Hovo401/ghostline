import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Authorizes "Ответить"/"Прочитано" on an Android message notification
 * (docs/adr/0017). The app's notification receivers run without the
 * WebView, so there's no access token — the worker embeds this in every
 * native `message` push instead, the way `declineToken` works for calls
 * (`calls/call.util.ts`). It names one user and one chat and expires, so a
 * leaked notification can't be replayed forever or against another chat.
 *
 * Format: `base64url("<userId>.<chatId>.<expUnixSeconds>").<hmac>`, signed
 * with `JWT_ACCESS_SECRET` under its own prefix so it can never collide with
 * a decline token's input.
 */

/** A notification stays answerable for a week — longer than anyone leaves one unread. */
export const CHAT_ACTION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret)
    .update(`notification-chat-action:${body}`)
    .digest("base64url");
}

export function signChatActionToken(
  secret: string,
  userId: string,
  chatId: string,
  now: number = Date.now(),
): string {
  const exp = Math.floor((now + CHAT_ACTION_TOKEN_TTL_MS) / 1000);
  const body = `${userId}.${chatId}.${String(exp)}`;
  return `${Buffer.from(body).toString("base64url")}.${sign(secret, body)}`;
}

export function verifyChatActionToken(
  secret: string,
  token: string,
  now: number = Date.now(),
): { userId: string; chatId: string } | null {
  const [encodedBody, signature] = token.split(".");
  if (!encodedBody || !signature) return null;

  const body = Buffer.from(encodedBody, "base64url").toString();
  const expected = Buffer.from(sign(secret, body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const [userId, chatId, exp] = body.split(".");
  if (!userId || !chatId || !exp || Number(exp) * 1000 < now) return null;
  return { userId, chatId };
}
