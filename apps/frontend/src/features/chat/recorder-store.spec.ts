import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRecorderStore } from "./recorder-store";

function reset(): void {
  useRecorderStore.setState({ kind: null, startedAt: null, elapsedMs: 0, levels: [] });
}

describe("useRecorderStore", () => {
  beforeEach(reset);
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle with no active recording", () => {
    expect(useRecorderStore.getState().kind).toBeNull();
    expect(useRecorderStore.getState().levels).toEqual([]);
  });

  it("start sets the kind and resets the clock/levels", () => {
    useRecorderStore.getState().tick(50);
    useRecorderStore.getState().start("voice");

    const state = useRecorderStore.getState();
    expect(state.kind).toBe("voice");
    expect(state.elapsedMs).toBe(0);
    expect(state.levels).toEqual([]);
  });

  it("tick appends a level sample and advances elapsedMs off real time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    useRecorderStore.getState().start("voice");

    vi.setSystemTime(250);
    useRecorderStore.getState().tick(120);

    const state = useRecorderStore.getState();
    expect(state.levels).toEqual([120]);
    expect(state.elapsedMs).toBe(250);
  });

  it("tick is a no-op before start", () => {
    useRecorderStore.getState().tick(120);
    expect(useRecorderStore.getState().levels).toEqual([]);
  });

  it("keeps only the most recent 36 level samples", () => {
    useRecorderStore.getState().start("video");
    for (let i = 0; i < 40; i += 1) {
      useRecorderStore.getState().tick(i);
    }
    const { levels } = useRecorderStore.getState();
    expect(levels).toHaveLength(36);
    expect(levels[0]).toBe(4);
    expect(levels.at(-1)).toBe(39);
  });

  it("stop clears the recording back to idle", () => {
    useRecorderStore.getState().start("video");
    useRecorderStore.getState().tick(80);

    useRecorderStore.getState().stop();

    expect(useRecorderStore.getState()).toMatchObject({
      kind: null,
      startedAt: null,
      elapsedMs: 0,
      levels: [],
    });
  });
});
