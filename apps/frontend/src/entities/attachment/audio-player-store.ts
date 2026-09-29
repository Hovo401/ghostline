import { create } from "zustand";

import { claimPlayback } from "../../shared/lib/exclusive-playback";

import { getCachedMedia } from "./media-cache";

export interface AudioTrack {
  messageId: string;
  attachmentId: string;
  /** Remote URL — used when the bytes aren't in the media cache yet. */
  url: string;
  /** "Вы" or the sender's name — the top bar's title. */
  title: string;
  createdAt: string;
  /** Known duration from the message — recorder webm files often report
   * `Infinity` as their own `duration`, so this is the fallback. */
  durationMs: number;
}

export const PLAYBACK_RATES = [1, 1.5, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

interface AudioPlayerState {
  track: AudioTrack | null;
  /** The chat's voice messages in feed order — ⏮/⏭ and autoplay-next. */
  queue: AudioTrack[];
  playing: boolean;
  positionMs: number;
  durationMs: number;
  rate: PlaybackRate;
  /** Starts `track` (toggles it if it's already the current one). With
   * `startFraction`, starts/jumps to that point instead of toggling. */
  play: (track: AudioTrack, queue: AudioTrack[], startFraction?: number) => void;
  toggle: () => void;
  seek: (fraction: number) => void;
  seekBy: (deltaMs: number) => void;
  cycleRate: () => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
}

/**
 * The app's single voice-message player (Telegram-style): one module-level
 * `<audio>` shared by every voice bubble, so starting one message always
 * stops the previous one, and `features/chat`'s top bar can show and
 * control whatever is playing even after its bubble scrolled away or the
 * user switched chats.
 */
export const useAudioPlayerStore = create<AudioPlayerState>((set, get) => ({
  track: null,
  queue: [],
  playing: false,
  positionMs: 0,
  durationMs: 0,
  rate: 1,
  play: (track, queue, startFraction) => {
    const state = get();
    if (state.track?.messageId === track.messageId) {
      set({ queue });
      if (startFraction === undefined) state.toggle();
      else state.seek(startFraction);
      return;
    }
    const audio = getAudio();
    const startMs = startFraction === undefined ? 0 : startFraction * track.durationMs;
    audio.pause();
    set({ track, queue, playing: false, positionMs: startMs, durationMs: track.durationMs });
    void sourceFor(track).then(({ src, owned }) => {
      // Another track may have been picked while the cache lookup ran.
      if (get().track?.messageId !== track.messageId) {
        if (owned) URL.revokeObjectURL(src);
        return;
      }
      releaseOwnedUrl();
      if (owned) ownedUrl = src;
      audio.src = src;
      audio.defaultPlaybackRate = get().rate;
      audio.playbackRate = get().rate;
      if (startMs > 0) audio.currentTime = startMs / 1000;
      start(audio);
    });
  },
  toggle: () => {
    if (!get().track) return;
    const audio = getAudio();
    if (audio.paused) start(audio);
    else audio.pause();
  },
  seek: (fraction) => {
    const { track, durationMs } = get();
    if (!track) return;
    const positionMs = Math.min(1, Math.max(0, fraction)) * durationMs;
    getAudio().currentTime = positionMs / 1000;
    set({ positionMs });
  },
  seekBy: (deltaMs) => {
    const { positionMs, durationMs, seek } = get();
    if (durationMs > 0) seek((positionMs + deltaMs) / durationMs);
  },
  cycleRate: () => {
    const index = PLAYBACK_RATES.indexOf(get().rate);
    const rate = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] ?? 1;
    const audio = getAudio();
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    set({ rate });
  },
  next: () => {
    const neighbour = neighbourOf(get(), 1);
    if (neighbour) get().play(neighbour, get().queue);
    else get().stop();
  },
  prev: () => {
    const neighbour = neighbourOf(get(), -1);
    if (neighbour) get().play(neighbour, get().queue);
    else get().seek(0);
  },
  stop: () => {
    const audio = getAudio();
    audio.pause();
    audio.removeAttribute("src");
    releaseOwnedUrl();
    set({ track: null, queue: [], playing: false, positionMs: 0, durationMs: 0 });
  },
}));

/** The queue entry `step` away from the current track, if any. */
export function neighbourOf(
  state: Pick<AudioPlayerState, "track" | "queue">,
  step: 1 | -1,
): AudioTrack | undefined {
  if (!state.track) return undefined;
  const messageId = state.track.messageId;
  const index = state.queue.findIndex((item) => item.messageId === messageId);
  return index === -1 ? undefined : state.queue[index + step];
}

let audioElement: HTMLAudioElement | null = null;
let ownedUrl: string | null = null;

function getAudio(): HTMLAudioElement {
  if (audioElement) return audioElement;
  const audio = new Audio();
  audio.preload = "auto";
  const setState = useAudioPlayerStore.setState;
  audio.addEventListener("timeupdate", () => {
    setState({ positionMs: audio.currentTime * 1000 });
  });
  audio.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setState({ durationMs: audio.duration * 1000 });
    }
  });
  audio.addEventListener("play", () => {
    setState({ playing: true });
  });
  audio.addEventListener("pause", () => {
    setState({ playing: false });
  });
  audio.addEventListener("ended", () => {
    useAudioPlayerStore.getState().next();
  });
  audioElement = audio;
  return audio;
}

function start(audio: HTMLAudioElement): void {
  claimPlayback(audio);
  audio.play().catch(() => {
    useAudioPlayerStore.setState({ playing: false });
  });
}

/** Prefers the cached bytes (docs/adr/0013) through a `blob:` URL the
 * player owns itself — a bubble's own URL is revoked once it unmounts,
 * which would cut playback off mid-message. */
async function sourceFor(track: AudioTrack): Promise<{ src: string; owned: boolean }> {
  const blob = await getCachedMedia(track.attachmentId).catch(() => null);
  return blob ? { src: URL.createObjectURL(blob), owned: true } : { src: track.url, owned: false };
}

function releaseOwnedUrl(): void {
  if (ownedUrl) URL.revokeObjectURL(ownedUrl);
  ownedUrl = null;
}
