import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAudioPlayerStore, type AudioTrack } from "../../entities/attachment";

import { AudioPlayerBar } from "./AudioPlayerBar";

const track: AudioTrack = {
  messageId: "m1",
  attachmentId: "a1",
  url: "https://s3.example/voice.webm",
  title: "Олег",
  createdAt: "2026-09-27T00:47:00.000Z",
  durationMs: 10_000,
};

beforeEach(() => {
  useAudioPlayerStore.setState({
    track,
    queue: [track],
    playing: true,
    positionMs: 3_000,
    durationMs: 10_000,
    rate: 1,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Restores the real actions the specs below swap for spies.
  useAudioPlayerStore.setState(useAudioPlayerStore.getInitialState(), true);
});

describe("AudioPlayerBar", () => {
  it("renders nothing without a track", () => {
    useAudioPlayerStore.setState({ track: null });
    const { container } = render(<AudioPlayerBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the sender, the position and a pause button while playing", () => {
    render(<AudioPlayerBar />);
    expect(screen.getByText("Олег")).toBeInTheDocument();
    expect(screen.getByText("0:03")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Пауза" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Предыдущее" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Следующее" })).toBeDisabled();
  });

  it("cycles the playback rate", () => {
    const cycleRate = vi.fn();
    useAudioPlayerStore.setState({ cycleRate });
    render(<AudioPlayerBar />);
    fireEvent.click(screen.getByRole("button", { name: "Скорость воспроизведения" }));
    expect(cycleRate).toHaveBeenCalled();
  });

  it("✕ stops the player", () => {
    const stop = vi.fn();
    useAudioPlayerStore.setState({ stop });
    render(<AudioPlayerBar />);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть плеер" }));
    expect(stop).toHaveBeenCalled();
  });

  it("clicking the progress line seeks to that fraction", () => {
    const seek = vi.fn();
    useAudioPlayerStore.setState({ seek });
    render(<AudioPlayerBar />);
    const slider = screen.getByRole("slider", { name: "Перемотка" });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 200,
    } as DOMRect);
    // jsdom has no PointerEvent — a MouseEvent carries `clientX` just the same.
    fireEvent(slider, new MouseEvent("pointerdown", { bubbles: true, clientX: 50 }));
    expect(seek).toHaveBeenCalledWith(0.25);
  });
});
