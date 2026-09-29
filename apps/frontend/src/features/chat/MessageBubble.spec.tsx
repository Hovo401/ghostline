import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "../../entities/message";

import { MessageBubble } from "./MessageBubble";

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1",
    chatId: "chat-1",
    seq: 1n,
    senderId: "user-a",
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
    createdAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("MessageBubble", () => {
  it("renders the real photo for an image message", () => {
    const message = makeMessage({
      type: "image",
      text: null,
      attachment: {
        id: "a1",
        key: "k",
        mime: "image/png",
        size: 1000,
        width: 800,
        height: 600,
        name: "photo.png",
        url: "https://s3.example/photo.png",
      },
    });
    render(
      <MessageBubble
        message={message}
        isOwn={false}
        isLastOutgoing={false}
        scrambleDelay={0}
        onRetry={vi.fn()}
      />,
    );

    const img = screen.getByRole("img", { name: "photo.png" });
    expect(img).toHaveAttribute("src", "https://s3.example/photo.png");
  });

  it("clicking an image message opens the fullscreen viewer for that message", () => {
    const onOpenImage = vi.fn();
    const message = makeMessage({
      id: "m-photo",
      type: "image",
      text: null,
      attachment: {
        id: "a1",
        key: "k",
        mime: "image/png",
        size: 1000,
        width: 800,
        height: 600,
        name: "photo.png",
        url: "https://s3.example/photo.png",
      },
    });
    render(
      <MessageBubble
        message={message}
        isOwn={false}
        isLastOutgoing={false}
        scrambleDelay={0}
        onRetry={vi.fn()}
        onOpenImage={onOpenImage}
      />,
    );

    screen.getByRole("button", { name: "Открыть фото" }).click();
    expect(onOpenImage).toHaveBeenCalledWith("m-photo");
  });

  it("renders the real name, size and extension for a file message", () => {
    const message = makeMessage({
      type: "file",
      text: null,
      attachment: {
        id: "a1",
        key: "k",
        mime: "application/pdf",
        size: 2_516_582,
        width: null,
        height: null,
        name: "report.final.pdf",
        url: "https://s3.example/report.pdf",
      },
    });
    render(
      <MessageBubble
        message={message}
        isOwn={false}
        isLastOutgoing={false}
        scrambleDelay={0}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("report.final.pdf")).toBeInTheDocument();
    expect(screen.getByText("2.4 МБ")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("renders a play button and duration for a voice message", () => {
    const message = makeMessage({
      type: "voice",
      text: null,
      durationMs: 12_000,
      waveform: [10, 200, 90],
      attachment: {
        id: "a1",
        key: "k",
        mime: "audio/webm",
        size: 1000,
        width: null,
        height: null,
        name: null,
        url: "https://s3.example/voice.webm",
      },
    });
    render(
      <MessageBubble
        message={message}
        isOwn={true}
        isLastOutgoing={false}
        scrambleDelay={0}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Воспроизвести" })).toBeInTheDocument();
    expect(screen.getByText("0:12")).toBeInTheDocument();
  });

  it("renders a round play control and duration for a video note", () => {
    const message = makeMessage({
      type: "video",
      text: null,
      durationMs: 5_000,
      attachment: {
        id: "a1",
        key: "k",
        mime: "video/webm",
        size: 1000,
        width: 480,
        height: 480,
        name: null,
        url: "https://s3.example/note.webm",
      },
    });
    render(
      <MessageBubble
        message={message}
        isOwn={false}
        isLastOutgoing={false}
        scrambleDelay={0}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Воспроизвести" })).toBeInTheDocument();
    expect(screen.getByText("0:05")).toBeInTheDocument();
  });

  it("renders an outgoing ended call with its duration", () => {
    const message = makeMessage({
      type: "call",
      text: null,
      call: { status: "ended", video: true, durationMs: 323_000 },
    });
    render(
      <MessageBubble
        message={message}
        isOwn={true}
        isLastOutgoing={false}
        scrambleDelay={0}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Исходящий видеозвонок · 5:23")).toBeInTheDocument();
  });

  it("renders a missed incoming call without a duration", () => {
    const message = makeMessage({
      type: "call",
      text: null,
      call: { status: "missed", video: false, durationMs: null },
    });
    render(
      <MessageBubble
        message={message}
        isOwn={false}
        isLastOutgoing={false}
        scrambleDelay={0}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Пропущенный аудиозвонок")).toBeInTheDocument();
  });

  it("tapping a call row starts a call back into the same chat", () => {
    const onCallBack = vi.fn();
    const message = makeMessage({
      type: "call",
      text: null,
      call: { status: "declined", video: true, durationMs: null },
    });
    render(
      <MessageBubble
        message={message}
        isOwn={true}
        isLastOutgoing={false}
        scrambleDelay={0}
        onRetry={vi.fn()}
        onCallBack={onCallBack}
      />,
    );

    screen.getByRole("button", { name: /Отклонённый видеозвонок/ }).click();
    expect(onCallBack).toHaveBeenCalledWith(message);
  });

  it("offers a retry for a failed message", () => {
    const onRetry = vi.fn();
    const message = makeMessage({ failed: true });
    render(
      <MessageBubble
        message={message}
        isOwn={true}
        isLastOutgoing={true}
        scrambleDelay={0}
        onRetry={onRetry}
      />,
    );

    screen.getByRole("button", { name: "Повторить" }).click();
    expect(onRetry).toHaveBeenCalledWith(message);
  });
});
