import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { upsertMessage, type ChatMessage } from "../../entities/message";
import { apiFetch } from "../../shared/api/http-client";
import { useSessionStore } from "../../shared/api/session-store";

import { useChatUiStore } from "./chat-ui-store";
import { Composer } from "./Composer";

vi.mock("../../shared/api/http-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../../shared/api/socket-client", () => ({
  getSocketClient: () => ({ emit: vi.fn() }),
}));

// The real grid needs layout jsdom lacks; the composer only needs an `onSelect` source.
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

const CHAT_ID = "22222222-2222-2222-2222-222222222222";
const ME = "33333333-3333-3333-3333-333333333333";

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    chatId: CHAT_ID,
    seq: 1n,
    senderId: ME,
    clientMessageId: "44444444-4444-4444-4444-444444444444",
    type: "text",
    text: "helo",
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

function renderComposer(messages: ChatMessage[]) {
  // `staleTime: Infinity` keeps `useMessages` on the seeded cache instead of fetching.
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  for (const message of messages) upsertMessage(queryClient, CHAT_ID, message);
  render(
    <QueryClientProvider client={queryClient}>
      <Composer chatId={CHAT_ID} />
    </QueryClientProvider>,
  );
  return screen.getByPlaceholderText("Сообщение");
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  useChatUiStore.setState({ drafts: {}, editing: {} });
  useSessionStore.setState({
    status: "authenticated",
    accessToken: "token",
    user: { id: ME } as never,
  });
});

afterEach(() => {
  cleanup();
});

describe("Composer — editing (FR-MSG-05/12)", () => {
  it("↑ in an empty composer edits the last own message", () => {
    const textarea = renderComposer([makeMessage({})]);

    fireEvent.keyDown(textarea, { key: "ArrowUp" });

    expect(screen.getByText("Редактирование")).toBeInTheDocument();
    expect(textarea).toHaveValue("helo");
  });

  it("Esc cancels editing and brings the draft back", () => {
    useChatUiStore.setState({ drafts: { [CHAT_ID]: "черновик" } });
    const message = makeMessage({});
    useChatUiStore.getState().startEditing(CHAT_ID, message.id, "helo");
    const textarea = renderComposer([message]);

    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(screen.queryByText("Редактирование")).not.toBeInTheDocument();
    expect(textarea).toHaveValue("черновик");
  });

  it("Enter saves the edit via PATCH", async () => {
    const message = makeMessage({});
    vi.mocked(apiFetch).mockResolvedValue({ ...message, seq: "1", text: "hello" });
    useChatUiStore.getState().startEditing(CHAT_ID, message.id, "helo");
    const textarea = renderComposer([message]);

    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(`/messages/${message.id}`, {
        method: "PATCH",
        body: { text: "hello" },
      });
    });
    expect(useChatUiStore.getState().editing[CHAT_ID]).toBeUndefined();
  });

  it("skips the request when the text didn't change", () => {
    const message = makeMessage({});
    useChatUiStore.getState().startEditing(CHAT_ID, message.id, "helo");
    const textarea = renderComposer([message]);

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(apiFetch).not.toHaveBeenCalled();
    expect(useChatUiStore.getState().editing[CHAT_ID]).toBeUndefined();
  });
});

describe("Composer — emoji panel (FR-MSG-03)", () => {
  it("opens from the smiley button and closes on Escape", () => {
    renderComposer([]);

    fireEvent.click(screen.getByRole("button", { name: "Эмодзи" }));
    expect(screen.getByRole("dialog", { name: "Эмодзи" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Эмодзи" })).not.toBeInTheDocument();
  });

  it("inserts the emoji at the caret and keeps the panel open", () => {
    useChatUiStore.setState({ drafts: { [CHAT_ID]: "ab" } });
    const textarea = renderComposer([]) as HTMLTextAreaElement;
    textarea.setSelectionRange(1, 1);

    fireEvent.click(screen.getByRole("button", { name: "Эмодзи" }));
    fireEvent.click(screen.getByRole("button", { name: "pick-party" }));

    expect(useChatUiStore.getState().drafts[CHAT_ID]).toBe("a🎉b");
    expect(screen.getByRole("dialog", { name: "Эмодзи" })).toBeInTheDocument();
  });

  it("replaces the selected text", () => {
    useChatUiStore.setState({ drafts: { [CHAT_ID]: "abc" } });
    const textarea = renderComposer([]) as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 2);

    fireEvent.click(screen.getByRole("button", { name: "Эмодзи" }));
    fireEvent.click(screen.getByRole("button", { name: "pick-party" }));

    expect(useChatUiStore.getState().drafts[CHAT_ID]).toBe("🎉c");
  });

  it("goes into the edited text while editing a message", () => {
    const message = makeMessage({});
    useChatUiStore.getState().startEditing(CHAT_ID, message.id, "helo");
    const textarea = renderComposer([message]) as HTMLTextAreaElement;
    textarea.setSelectionRange(4, 4);

    fireEvent.click(screen.getByRole("button", { name: "Эмодзи" }));
    fireEvent.click(screen.getByRole("button", { name: "pick-party" }));

    expect(useChatUiStore.getState().editing[CHAT_ID]?.text).toBe("helo🎉");
    expect(useChatUiStore.getState().drafts[CHAT_ID]).toBeUndefined();
  });
});
