import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "../../entities/message";
import { apiFetch } from "../../shared/api/http-client";
import { useSessionStore } from "../../shared/api/session-store";

import { ReactionBar } from "./ReactionBar";

vi.mock("../../shared/api/http-client", () => ({
  apiFetch: vi.fn(),
}));

const ME = "33333333-3333-3333-3333-333333333333";
const PEER = "44444444-4444-4444-4444-444444444444";

function makeMessage(reactions: ChatMessage["reactions"]): ChatMessage {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    chatId: "22222222-2222-2222-2222-222222222222",
    seq: 1n,
    senderId: PEER,
    clientMessageId: "55555555-5555-5555-5555-555555555555",
    type: "text",
    text: "привет",
    attachmentId: null,
    attachment: null,
    durationMs: null,
    waveform: null,
    replyToId: null,
    call: null,
    reactions,
    status: "sent",
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-01-01T12:00:00.000Z",
  };
}

function renderBar(message: ChatMessage) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReactionBar message={message} isOwn={false} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(undefined);
  useSessionStore.setState({
    status: "authenticated",
    accessToken: "token",
    user: { id: ME } as never,
  });
});

afterEach(() => {
  cleanup();
});

describe("ReactionBar", () => {
  it("renders a chip per emoji with its count", () => {
    renderBar(
      makeMessage([
        { emoji: "👍", count: 2, userIds: [PEER, "x"] },
        { emoji: "🔥", count: 1, userIds: [ME] },
      ]),
    );

    expect(screen.getByRole("button", { name: "👍 2" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "🔥 1, включая вашу" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("tapping a chip you haven't used sets that reaction", async () => {
    renderBar(makeMessage([{ emoji: "👍", count: 1, userIds: [PEER] }]));

    fireEvent.click(screen.getByRole("button", { name: "👍 1" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/messages/11111111-1111-1111-1111-111111111111/reaction",
        { method: "PUT", body: { emoji: "👍" } },
      );
    });
  });

  it("tapping your own chip removes the reaction", async () => {
    renderBar(makeMessage([{ emoji: "🔥", count: 1, userIds: [ME] }]));

    fireEvent.click(screen.getByRole("button", { name: "🔥 1, включая вашу" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/messages/11111111-1111-1111-1111-111111111111/reaction",
        { method: "DELETE" },
      );
    });
  });

  it("is inert while the session isn't known", () => {
    useSessionStore.setState({ status: "anonymous", accessToken: null, user: null });
    renderBar(makeMessage([{ emoji: "👍", count: 1, userIds: [PEER] }]));

    expect(screen.getByRole("button", { name: "👍 1" })).toBeDisabled();
  });
});
