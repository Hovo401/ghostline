import { describe, expect, it } from "vitest";

import {
  CHAT_ACTION_TOKEN_TTL_MS,
  signChatActionToken,
  verifyChatActionToken,
} from "./action-token";

const SECRET = "s".repeat(32);
const USER = "7f0c2f4e-0000-4000-8000-000000000001";
const CHAT = "7f0c2f4e-0000-4000-8000-000000000002";

describe("chat action token", () => {
  it("round-trips the user and chat it was signed for", () => {
    const token = signChatActionToken(SECRET, USER, CHAT);
    expect(verifyChatActionToken(SECRET, token)).toEqual({ userId: USER, chatId: CHAT });
  });

  it("rejects a token signed with another secret", () => {
    const token = signChatActionToken("x".repeat(32), USER, CHAT);
    expect(verifyChatActionToken(SECRET, token)).toBeNull();
  });

  it("rejects a token whose body was swapped for another chat", () => {
    const token = signChatActionToken(SECRET, USER, CHAT);
    const [, signature] = token.split(".");
    const forgedBody = Buffer.from(`${USER}.other-chat.9999999999`).toString("base64url");
    expect(verifyChatActionToken(SECRET, `${forgedBody}.${signature ?? ""}`)).toBeNull();
  });

  it("expires after the TTL", () => {
    const issuedAt = Date.now();
    const token = signChatActionToken(SECRET, USER, CHAT, issuedAt);
    expect(
      verifyChatActionToken(SECRET, token, issuedAt + CHAT_ACTION_TOKEN_TTL_MS - 1000),
    ).not.toBeNull();
    expect(
      verifyChatActionToken(SECRET, token, issuedAt + CHAT_ACTION_TOKEN_TTL_MS + 1000),
    ).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyChatActionToken(SECRET, "")).toBeNull();
    expect(verifyChatActionToken(SECRET, "abc")).toBeNull();
    expect(verifyChatActionToken(SECRET, "abc.def")).toBeNull();
  });
});
