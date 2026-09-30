import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { useAudioPlayerStore, useMediaViewerStore } from "../../entities/attachment";
import type { ChatMessage } from "../../entities/message";

import { MessageBubble } from "./MessageBubble";

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
    reactions: [],
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
  it("renders the real photo for an image message", async () => {
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

    const img = await screen.findByRole("img", { name: "photo.png" });
    expect(img).toHaveAttribute("src", "blob:cached");
  });

  it("clicking an image message opens the fullscreen viewer for that message", async () => {
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

    (await screen.findByRole("button", { name: "Открыть фото" })).click();
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

  it("opens an image sent as a file in the media viewer", () => {
    const attachment = {
      id: "a2",
      key: "k",
      mime: "image/png",
      size: 3_000_000,
      width: null,
      height: null,
      name: "Screenshot.png",
      url: "https://s3.example/s.png",
    };
    render(
      <MessageBubble
        message={makeMessage({ type: "file", text: null, attachment })}
        isOwn
        isLastOutgoing={false}
        scrambleDelay={0}
        onRetry={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Просмотр" }));
    expect(useMediaViewerStore.getState().items).toEqual([attachment]);
    expect(useMediaViewerStore.getState().index).toBe(0);
    useMediaViewerStore.getState().close();
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

  it("the voice play button hands the message to the shared player", () => {
    const onPlayVoice = vi.fn();
    const message = makeMessage({
      type: "voice",
      text: null,
      durationMs: 12_000,
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
        isOwn={false}
        isLastOutgoing={false}
        scrambleDelay={0}
        onRetry={vi.fn()}
        onPlayVoice={onPlayVoice}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Воспроизвести" }));
    expect(onPlayVoice).toHaveBeenCalledWith(message);

    const slider = screen.getByRole("slider", { name: "Перемотка" });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
    // jsdom has no PointerEvent — a MouseEvent carries `clientX` just the same.
    fireEvent(slider, new MouseEvent("pointerdown", { bubbles: true, clientX: 75 }));
    expect(onPlayVoice).toHaveBeenLastCalledWith(message, 0.75);
  });

  it("the voice bubble that is playing shows pause and its position", () => {
    useAudioPlayerStore.setState({
      track: {
        messageId: "m1",
        attachmentId: "a1",
        url: "https://s3.example/voice.webm",
        title: "Олег",
        createdAt: "2026-09-27T00:47:00.000Z",
        durationMs: 12_000,
      },
      playing: true,
      positionMs: 3_000,
      durationMs: 12_000,
    });
    render(
      <MessageBubble
        message={makeMessage({
          type: "voice",
          text: null,
          durationMs: 12_000,
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
        })}
        isOwn={false}
        isLastOutgoing={false}
        scrambleDelay={0}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Пауза" })).toBeInTheDocument();
    expect(screen.getByText("0:03")).toBeInTheDocument();
    useAudioPlayerStore.setState({ track: null, playing: false, positionMs: 0, durationMs: 0 });
  });

  it("renders a round play control and duration for a video note", () => {
    const message = makeMessage({
      type: "video_note",
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

    fireEvent.click(screen.getByRole("button", { name: "Увеличить" }));
    expect(useMediaViewerStore.getState().index).toBe(0);
    expect(useMediaViewerStore.getState().round).toBe(true);
    useMediaViewerStore.getState().close();
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
