import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { claimPlayback } from "../../shared/lib/exclusive-playback";

import { neighbourOf, useAudioPlayerStore, type AudioTrack } from "./audio-player-store";

vi.mock("./media-cache", () => ({
  getCachedMedia: vi.fn(() => Promise.resolve(null)),
}));

// jsdom has no media playback — fake `play`/`pause`/`paused` just enough
// for the player's event wiring to behave like a browser's.
const pausedState = new WeakMap<HTMLMediaElement, boolean>();

function track(id: string, durationMs = 10_000): AudioTrack {
  return {
    messageId: id,
    attachmentId: `att-${id}`,
    url: `https://s3.example/${id}.webm`,
    title: "Олег",
    createdAt: "2026-09-27T00:47:00.000Z",
    durationMs,
  };
}

const a = track("a");
const b = track("b");
const c = track("c");
const queue = [a, b, c];

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let playSpy: MockInstance<HTMLMediaElement["play"]> | undefined;

/** The player's (module-private) `<audio>` — whatever `play()` ran on last. */
function audio(): HTMLMediaElement {
  const element = playSpy?.mock.contexts.at(-1);
  if (!(element instanceof HTMLMediaElement)) throw new Error("nothing has played yet");
  return element;
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return pausedState.get(this) ?? true;
  });
  playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    pausedState.set(this, false);
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    if (pausedState.get(this) === false) {
      pausedState.set(this, true);
      this.dispatchEvent(new Event("pause"));
    }
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  useAudioPlayerStore.setState({ rate: 1 });
  useAudioPlayerStore.getState().stop();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAudioPlayerStore", () => {
  it("plays a track and exposes it as current", async () => {
    useAudioPlayerStore.getState().play(a, queue);
    await flush();
    const state = useAudioPlayerStore.getState();
    expect(state.track?.messageId).toBe("a");
    expect(state.playing).toBe(true);
    expect(audio().getAttribute("src")).toBe("https://s3.example/a.webm");
  });

  it("starting another track replaces the current one — only one plays", async () => {
    useAudioPlayerStore.getState().play(a, queue);
    await flush();
    useAudioPlayerStore.getState().play(b, queue);
    await flush();
    expect(useAudioPlayerStore.getState().track?.messageId).toBe("b");
    expect(audio().getAttribute("src")).toBe("https://s3.example/b.webm");
    expect(useAudioPlayerStore.getState().playing).toBe(true);
  });

  it("playing the current track again toggles pause", async () => {
    useAudioPlayerStore.getState().play(a, queue);
    await flush();
    useAudioPlayerStore.getState().play(a, queue);
    expect(useAudioPlayerStore.getState().playing).toBe(false);
    expect(useAudioPlayerStore.getState().track?.messageId).toBe("a");
  });

  it("pauses a video note that was playing", async () => {
    const video = document.createElement("video");
    void video.play();
    claimPlayback(video);
    useAudioPlayerStore.getState().play(a, queue);
    await flush();
    expect(video.paused).toBe(true);
  });

  it("autoplays the next track on ended and stops after the last", async () => {
    useAudioPlayerStore.getState().play(b, queue);
    await flush();
    audio().dispatchEvent(new Event("ended"));
    await flush();
    expect(useAudioPlayerStore.getState().track?.messageId).toBe("c");
    audio().dispatchEvent(new Event("ended"));
    expect(useAudioPlayerStore.getState().track).toBeNull();
  });

  it("seek moves the position within the known duration", async () => {
    useAudioPlayerStore.getState().play(a, queue);
    await flush();
    useAudioPlayerStore.getState().seek(0.5);
    expect(useAudioPlayerStore.getState().positionMs).toBe(5_000);
    expect(audio().currentTime).toBe(5);
  });

  it("starts a new track at a given fraction", async () => {
    useAudioPlayerStore.getState().play(c, queue, 0.25);
    await flush();
    expect(useAudioPlayerStore.getState().positionMs).toBe(2_500);
    expect(audio().currentTime).toBe(2.5);
  });

  it("cycles the playback rate 1 → 1.5 → 2 → 1", () => {
    const { cycleRate } = useAudioPlayerStore.getState();
    cycleRate();
    expect(useAudioPlayerStore.getState().rate).toBe(1.5);
    cycleRate();
    expect(useAudioPlayerStore.getState().rate).toBe(2);
    cycleRate();
    expect(useAudioPlayerStore.getState().rate).toBe(1);
  });

  it("neighbourOf walks the queue", () => {
    expect(neighbourOf({ track: a, queue }, -1)).toBeUndefined();
    expect(neighbourOf({ track: a, queue }, 1)?.messageId).toBe("b");
    expect(neighbourOf({ track: c, queue }, 1)).toBeUndefined();
  });
});
