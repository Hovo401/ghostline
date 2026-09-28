import { create } from "zustand";

export type RecorderKind = "voice" | "video";

/** Cap for a video note — DESIGN-BRIEF.md §7.2 / the prototype's `1:00`
 * ring, auto-finishes the recording instead of just disabling the button. */
export const VIDEO_NOTE_MAX_MS = 60_000;

/** Rolling live-waveform window kept in state — the prototype's `recBars`
 * shows 36 bars; this is also what gets sent as `SendMessageRequest.waveform`
 * once recording finishes, so it doubles as the persisted waveform. */
const MAX_LEVELS = 36;

interface RecorderState {
  kind: RecorderKind | null;
  startedAt: number | null;
  elapsedMs: number;
  /** 0–255 per sample, oldest first — matches the wire `waveform` shape. */
  levels: number[];
  start: (kind: RecorderKind) => void;
  /** Appends one live level sample (0–255) and advances the clock off the
   * real elapsed time rather than a fixed step, so it survives tab
   * throttling without drifting. */
  tick: (level: number) => void;
  stop: () => void;
}

/** Client-only recording state machine (voice/video note composer flow) —
 * Zustand per apps/frontend/CLAUDE.md, colocated with the chat feature.
 * `use-recorder.ts` drives this off `MediaRecorder`/`AnalyserNode`; kept
 * separate so the state transitions are testable without real media APIs. */
export const useRecorderStore = create<RecorderState>((set, get) => ({
  kind: null,
  startedAt: null,
  elapsedMs: 0,
  levels: [],
  start: (kind) => {
    set({ kind, startedAt: Date.now(), elapsedMs: 0, levels: [] });
  },
  tick: (level) => {
    const { startedAt } = get();
    if (startedAt === null) return;
    set((state) => ({
      elapsedMs: Date.now() - startedAt,
      levels: [...state.levels.slice(-(MAX_LEVELS - 1)), level],
    }));
  },
  stop: () => {
    set({ kind: null, startedAt: null, elapsedMs: 0, levels: [] });
  },
}));
