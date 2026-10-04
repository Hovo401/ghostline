import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { messagesQueryKey } from "../../shared/api/query-keys";

import {
  flattenMessages,
  markDeliveredUpTo,
  reconcileNewestPage,
  upsertMessage,
  type MessagesData,
} from "./message-cache";
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
    reactions: [],
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

describe("reconcileNewestPage", () => {
  const ids = (client: QueryClient): string[] =>
    flattenMessages(client.getQueryData<MessagesData>(messagesQueryKey("chat-1"))).map((m) => m.id);

  it("replaces an edited message and its reactions", () => {
    const a = makeMessage({ id: "a", clientMessageId: "ca", seq: 5n });
    const client = seed([[a]]);
    const reactions = [{ emoji: "x", userIds: ["u2"] }] as ChatMessage["reactions"];

    reconcileNewestPage(client, "chat-1", [
      { ...a, text: "edited", editedAt: "2026-01-02T00:00:00.000Z", reactions },
    ]);

    const [m] = flattenMessages(client.getQueryData<MessagesData>(messagesQueryKey("chat-1")));
    expect(m?.text).toBe("edited");
    expect(m?.reactions).toEqual(reactions);
  });

  it("removes a confirmed message missing from the server page", () => {
    const a = makeMessage({ id: "a", clientMessageId: "ca", seq: 5n });
    const b = makeMessage({ id: "b", clientMessageId: "cb", seq: 6n });
    const c = makeMessage({ id: "c", clientMessageId: "cc", seq: 7n });
    const client = seed([[a, b, c]]);
    reconcileNewestPage(client, "chat-1", [a, c]);
    expect(ids(client)).toEqual(["a", "c"]);
  });

  it("keeps pending and failed bubbles", () => {
    const a = makeMessage({ id: "a", clientMessageId: "ca", seq: 5n });
    const p = makeMessage({ id: "p", clientMessageId: "cp", seq: 9n, pending: true });
    const f = makeMessage({ id: "f", clientMessageId: "cf", seq: 9n, failed: true });
    const client = seed([[a, p, f]]);
    reconcileNewestPage(client, "chat-1", [a]);
    expect(ids(client).sort()).toEqual(["a", "f", "p"]);
  });

  it("leaves messages older than the server page alone", () => {
    const old = makeMessage({ id: "old", clientMessageId: "co", seq: 1n });
    const a = makeMessage({ id: "a", clientMessageId: "ca", seq: 50n });
    const client = seed([[a], [old]]);
    reconcileNewestPage(client, "chat-1", [a]);
    expect(ids(client)).toEqual(["old", "a"]);
  });

  it("removes nothing for an empty page", () => {
    const a = makeMessage({ id: "a", clientMessageId: "ca", seq: 5n });
    const client = seed([[a]]);
    reconcileNewestPage(client, "chat-1", []);
    expect(ids(client)).toEqual(["a"]);
  });

  it("keeps confirmed messages newer than the server page", () => {
    const a = makeMessage({ id: "a", clientMessageId: "ca", seq: 5n });
    const live = makeMessage({ id: "live", clientMessageId: "cl", seq: 8n });
    const acked = makeMessage({ id: "acked", clientMessageId: "ck", seq: 9n, pending: false });
    const client = seed([[a, live, acked]]);
    reconcileNewestPage(client, "chat-1", [a]);
    expect(ids(client)).toEqual(["a", "live", "acked"]);
  });
});
