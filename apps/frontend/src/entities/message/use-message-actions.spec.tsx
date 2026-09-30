import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";
import { messagesQueryKey } from "../../shared/api/query-keys";
import { useToastStore } from "../../shared/ui/toast-store";

import { flattenMessages, upsertMessage, type MessagesData } from "./message-cache";
import type { ChatMessage } from "./message.types";
import { useDeleteMessage, useEditMessage } from "./use-message-actions";

vi.mock("../../shared/api/http-client", () => ({
  apiFetch: vi.fn(),
}));

const CHAT_ID = "22222222-2222-2222-2222-222222222222";

const MESSAGE: ChatMessage = {
  id: "11111111-1111-1111-1111-111111111111",
  chatId: CHAT_ID,
  seq: 1n,
  senderId: "33333333-3333-3333-3333-333333333333",
  clientMessageId: "44444444-4444-4444-4444-444444444444",
  type: "text",
  text: "helo",
  attachmentId: null,
  attachment: null,
  durationMs: null,
  waveform: null,
  replyToId: null,
  call: null,
  status: "sent",
  editedAt: null,
  deletedAt: null,
  createdAt: "2026-01-01T12:00:00.000Z",
};

function renderWithClient<T>(callback: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  upsertMessage(queryClient, CHAT_ID, MESSAGE);
  const view = renderHook(callback, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  const cached = () =>
    flattenMessages(queryClient.getQueryData<MessagesData>(messagesQueryKey(CHAT_ID)));
  return { ...view, cached };
}

describe("useEditMessage", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    useToastStore.setState({ toasts: [] });
  });

  it("PATCHes the message and keeps the server's version", async () => {
    const edited = { ...MESSAGE, text: "hello", editedAt: "2026-01-01T12:05:00.000Z" };
    vi.mocked(apiFetch).mockResolvedValue({ ...edited, seq: "1" });
    const { result, cached } = renderWithClient(() => useEditMessage());

    result.current.mutate({ message: MESSAGE, text: "hello" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(apiFetch).toHaveBeenCalledWith(`/messages/${MESSAGE.id}`, {
      method: "PATCH",
      body: { text: "hello" },
    });
    expect(cached()).toEqual([edited]);
  });

  it("rolls back to the original text and toasts on failure", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    const { result, cached } = renderWithClient(() => useEditMessage());

    result.current.mutate({ message: MESSAGE, text: "hello" });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(cached()).toEqual([MESSAGE]);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});

describe("useDeleteMessage", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    useToastStore.setState({ toasts: [] });
  });

  it("DELETEs the message and drops it from the cache", async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    const { result, cached } = renderWithClient(() => useDeleteMessage());

    result.current.mutate(MESSAGE);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(apiFetch).toHaveBeenCalledWith(`/messages/${MESSAGE.id}`, { method: "DELETE" });
    expect(cached()).toEqual([]);
  });

  it("puts the message back and toasts on failure", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    const { result, cached } = renderWithClient(() => useDeleteMessage());

    result.current.mutate(MESSAGE);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(cached()).toEqual([MESSAGE]);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
