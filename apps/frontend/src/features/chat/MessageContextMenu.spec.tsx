import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "../../entities/message";
import { apiFetch } from "../../shared/api/http-client";

import { useChatUiStore } from "./chat-ui-store";
import { MessageFeed } from "./MessageFeed";

vi.mock("../../shared/api/http-client", () => ({
  apiFetch: vi.fn(),
}));

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1",
    chatId: "chat-1",
    seq: 1n,
    senderId: "user-a",
    clientMessageId: "c1",
    type: "text",
    text: "привет",
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
    ...overrides,
  };
}

function renderFeed(messages: ChatMessage[]) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MessageFeed
        chatId="chat-1"
        messages={messages}
        currentUserId="user-a"
        peerName="Олег"
        peerTyping={false}
        hasMore={false}
        onLoadMore={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

function openMenuOn(text: string): void {
  fireEvent.contextMenu(screen.getByText(text));
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  useChatUiStore.setState({ editing: {} });
});

afterEach(() => {
  cleanup();
});

describe("MessageContextMenu", () => {
  it("offers copy/edit/delete on an own text message", () => {
    renderFeed([makeMessage({})]);

    openMenuOn("привет");

    expect(screen.getByRole("menuitem", { name: "Копировать" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Изменить" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Удалить" })).toBeInTheDocument();
  });

  it("offers only copy on a peer's message", () => {
    renderFeed([makeMessage({ senderId: "user-b" })]);

    openMenuOn("привет");

    expect(screen.getByRole("menuitem", { name: "Копировать" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Изменить" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Удалить" })).not.toBeInTheDocument();
  });

  it("'Изменить' puts the composer into edit mode for that message", () => {
    renderFeed([makeMessage({})]);

    openMenuOn("привет");
    fireEvent.click(screen.getByRole("menuitem", { name: "Изменить" }));

    expect(useChatUiStore.getState().editing["chat-1"]).toEqual({
      messageId: "m1",
      original: "привет",
      text: "привет",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("deletes only after the confirmation step", async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    renderFeed([makeMessage({})]);

    openMenuOn("привет");
    fireEvent.click(screen.getByRole("menuitem", { name: "Удалить" }));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(screen.getByText("Удалить у всех?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Удалить" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/messages/m1", { method: "DELETE" });
    });
  });
});
