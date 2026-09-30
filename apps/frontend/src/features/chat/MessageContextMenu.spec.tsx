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

// The real grid needs layout jsdom lacks; the "＋" button only has to mount it.
vi.mock("./EmojiPicker", () => ({
  EmojiPicker: ({ onSelect }: { onSelect: (emoji: string) => void }) => (
    <button
      type="button"
      onClick={() => {
        onSelect("🎉");
      }}
    >
      pick-party
    </button>
  ),
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
    reactions: [],
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

  it("offers quick reactions on any live message, own or a peer's", () => {
    renderFeed([makeMessage({ senderId: "user-b" })]);

    openMenuOn("привет");

    const row = screen.getByRole("group", { name: "Быстрые реакции" });
    expect(row).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Реакция 👍" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Больше реакций" })).toBeInTheDocument();
  });

  it("a quick reaction is PUT to the message and closes the menu", async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    renderFeed([makeMessage({ senderId: "user-b" })]);

    openMenuOn("привет");
    fireEvent.click(screen.getByRole("button", { name: "Реакция ❤️" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/messages/m1/reaction", {
        method: "PUT",
        body: { emoji: "❤️" },
      });
    });
    expect(screen.queryByRole("group", { name: "Быстрые реакции" })).not.toBeInTheDocument();
  });

  it("marks your current reaction and clears it when picked again", async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    renderFeed([
      makeMessage({
        senderId: "user-b",
        reactions: [{ emoji: "👍", count: 1, userIds: ["user-a"] }],
      }),
    ]);

    openMenuOn("привет");
    const thumbs = screen.getByRole("button", { name: "Реакция 👍" });
    expect(thumbs).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(thumbs);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/messages/m1/reaction", { method: "DELETE" });
    });
  });

  it("'＋' opens the full picker in place of the menu, and a pick becomes the reaction", async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    renderFeed([makeMessage({ senderId: "user-b" })]);

    openMenuOn("привет");
    fireEvent.click(screen.getByRole("button", { name: "Больше реакций" }));
    expect(screen.queryByRole("menuitem", { name: "Копировать" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "pick-party" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/messages/m1/reaction", {
        method: "PUT",
        body: { emoji: "🎉" },
      });
    });
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
