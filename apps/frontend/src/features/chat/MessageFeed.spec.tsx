import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { useMediaViewerStore } from "../../entities/attachment";
import type { ChatMessage } from "../../entities/message";

import { MessageFeed } from "./MessageFeed";

// Photos now render from the media cache (docs/adr/0013) — serve every
// attachment from it so no spec hits the network.
vi.mock("../../entities/attachment/media-cache", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getCachedMedia: () => Promise.resolve(new Blob(["x"], { type: "image/png" })),
}));

beforeAll(() => {
  URL.createObjectURL = () => "blob:cached";
  URL.revokeObjectURL = () => undefined;
});

function makeImageMessage(id: string, attachmentId: string): ChatMessage {
  return {
    id,
    chatId: "chat-1",
    seq: 1n,
    senderId: "user-a",
    clientMessageId: id,
    type: "image",
    text: null,
    attachmentId,
    attachment: {
      id: attachmentId,
      key: `key-${attachmentId}`,
      mime: "image/png",
      size: 1000,
      width: 800,
      height: 600,
      name: `${attachmentId}.png`,
      url: `https://s3.example/${attachmentId}.png`,
    },
    durationMs: null,
    waveform: null,
    replyToId: null,
    call: null,
    reactions: [],
    status: "sent",
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-01-01T12:00:00.000Z",
  };
}

function renderFeed(messages: ChatMessage[]) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
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

beforeEach(() => {
  useMediaViewerStore.setState({ items: [], index: null });
});

afterEach(() => {
  cleanup();
});

describe("MessageFeed", () => {
  it("clicking an image message opens the viewer with the full gallery at the right index", async () => {
    const messages = [
      makeImageMessage("m1", "a1"),
      makeImageMessage("m2", "a2"),
      makeImageMessage("m3", "a3"),
    ];
    renderFeed(messages);

    const buttons = await screen.findAllByRole("button", { name: "Открыть фото" });
    buttons[1]?.click();

    const state = useMediaViewerStore.getState();
    expect(state.index).toBe(1);
    expect(state.items.map((item) => item.id)).toEqual(["a1", "a2", "a3"]);
  });
});
