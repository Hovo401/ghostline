import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { messagesQueryKey } from "../../shared/api/query-keys";

import { flattenMessages, type MessagesData } from "./message-cache";
import type { ChatMessage } from "./message.types";
import { useMessageRealtime } from "./use-message-realtime";
import { fetchMessagePage, fetchMessagesAfter } from "./use-messages";

const listeners = new Map<string, () => void>();
const socket = {
  connected: false,
  on: vi.fn((event: string, handler: () => void) => {
    listeners.set(event, handler);
  }),
  off: vi.fn(),
};

vi.mock("../../shared/api/socket-client", () => ({ getSocketClient: () => socket }));
vi.mock("../user/use-current-user-id", () => ({ useCurrentUserId: () => "me" }));
vi.mock("./use-messages", () => ({
  fetchMessagesAfter: vi.fn(),
  fetchMessagePage: vi.fn(),
}));

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

function setup(messages: ChatMessage[]): QueryClient {
  const client = new QueryClient();
  client.setQueryData<MessagesData>(messagesQueryKey("chat-1"), {
    pages: [messages],
    pageParams: [undefined],
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(
    () => {
      useMessageRealtime();
    },
    { wrapper },
  );
  return client;
}

describe("useMessageRealtime catch-up", () => {
  beforeEach(() => {
    listeners.clear();
    vi.mocked(fetchMessagesAfter).mockReset().mockResolvedValue([]);
    vi.mocked(fetchMessagePage).mockReset().mockResolvedValue([]);
  });

  it("does nothing on the first connect, re-syncs on the second", async () => {
    const a = makeMessage({ id: "a", clientMessageId: "ca", seq: 5n, text: "old" });
    const client = setup([a]);
    const reactions = [{ emoji: "x", userIds: ["u2"] }] as ChatMessage["reactions"];
    vi.mocked(fetchMessagePage).mockResolvedValue([{ ...a, text: "edited", reactions }]);

    listeners.get("connect")?.();
    expect(fetchMessagesAfter).not.toHaveBeenCalled();
    expect(fetchMessagePage).not.toHaveBeenCalled();

    listeners.get("connect")?.();
    await waitFor(() => {
      expect(fetchMessagePage).toHaveBeenCalledWith("chat-1", undefined);
    });
    expect(fetchMessagesAfter).toHaveBeenCalledWith("chat-1", 5n);
    await waitFor(() => {
      const [m] = flattenMessages(client.getQueryData<MessagesData>(messagesQueryKey("chat-1")));
      expect(m?.text).toBe("edited");
      expect(m?.reactions).toEqual(reactions);
    });
  });

  it("uses the newest confirmed seq, ignoring failed bubbles", async () => {
    const a = makeMessage({ id: "a", clientMessageId: "ca", seq: 5n });
    const f = makeMessage({
      id: "f",
      clientMessageId: "cf",
      seq: BigInt(Date.now()),
      failed: true,
    });
    setup([a, f]);

    listeners.get("connect")?.();
    listeners.get("connect")?.();

    await waitFor(() => {
      expect(fetchMessagesAfter).toHaveBeenCalledWith("chat-1", 5n);
    });
  });

  it("ignores a pending bubble when picking the newest confirmed seq", async () => {
    const a = makeMessage({ id: "a", clientMessageId: "ca", seq: 5n });
    const p = makeMessage({
      id: "p",
      clientMessageId: "cp",
      seq: BigInt(Date.now()),
      pending: true,
    });
    setup([a, p]);

    listeners.get("connect")?.();
    listeners.get("connect")?.();

    await waitFor(() => {
      expect(fetchMessagesAfter).toHaveBeenCalledWith("chat-1", 5n);
    });
  });
});
