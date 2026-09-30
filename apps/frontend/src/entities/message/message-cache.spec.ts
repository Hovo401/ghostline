import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { messagesQueryKey } from "../../shared/api/query-keys";

import { markDeliveredUpTo, upsertMessage, type MessagesData } from "./message-cache";
import type { ChatMessage } from "./message.types";

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1",
    chatId: "chat-1",
    seq: 1n,
    senderId: "me",
    clientMessageId: "c1",
    type: "text",
    text: "hi",
    attachmentId: null,
    attachment: null,
    durationMs: null,
    waveform: null,
    replyToId: null,
    call: null,
    status: "sent",
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function seed(pages: ChatMessage[][]): QueryClient {
  const client = new QueryClient();
  client.setQueryData<MessagesData>(messagesQueryKey("chat-1"), {
    pages,
    pageParams: pages.map(() => undefined),
  });
  return client;
}

describe("upsertMessage", () => {
  it("replaces an edited message in its own (older) page instead of duplicating it", () => {
    const old = makeMessage({ id: "old", clientMessageId: "co", seq: 1n, text: "before" });
    const newest = makeMessage({ id: "new", clientMessageId: "cn", seq: 60n });
    const client = seed([[newest], [old]]);

    upsertMessage(client, "chat-1", { ...old, text: "after" });

    const data = client.getQueryData<MessagesData>(messagesQueryKey("chat-1"));
    expect(data?.pages[0]).toEqual([newest]);
    expect(data?.pages[1]?.map((m) => m.text)).toEqual(["after"]);
  });

  it("puts a brand-new message into the newest page", () => {
    const client = seed([[makeMessage({ id: "a", seq: 1n })]]);
    upsertMessage(client, "chat-1", makeMessage({ id: "b", clientMessageId: "cb", seq: 2n }));
    const data = client.getQueryData<MessagesData>(messagesQueryKey("chat-1"));
    expect(data?.pages[0]?.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("markDeliveredUpTo", () => {
  it("lifts own sent messages to delivered but never downgrades read", () => {
    const client = seed([
      [
        makeMessage({ id: "1", clientMessageId: "c1", seq: 1n, status: "read" }),
        makeMessage({ id: "2", clientMessageId: "c2", seq: 2n, status: "sent" }),
        makeMessage({ id: "3", clientMessageId: "c3", seq: 3n, status: "sent" }),
      ],
    ]);
    markDeliveredUpTo(client, "chat-1", "peer", "me", 2n);
    const data = client.getQueryData<MessagesData>(messagesQueryKey("chat-1"));
    expect(data?.pages[0]?.map((m) => m.status)).toEqual(["read", "delivered", "sent"]);
  });
});
