import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NativeAudioRoutes } from "../../shared/native";

import { useNativeAudioRoutes } from "./use-native-audio-routes";

const mocks = vi.hoisted(() => ({
  isNativeApp: vi.fn(() => true),
  getNativeAudioRoutes: vi.fn<() => Promise<NativeAudioRoutes | null>>(),
  listenForNativeAudioRoutes: vi.fn<(cb: (routes: NativeAudioRoutes) => void) => () => void>(),
}));

vi.mock("../../shared/native", () => mocks);

const snapshot: NativeAudioRoutes = {
  current: "earpiece",
  available: [
    { route: "earpiece", name: "Phone" },
    { route: "speaker", name: "Speaker" },
  ],
};
const unlisten = vi.fn();
let emit: (routes: NativeAudioRoutes) => void;

describe("useNativeAudioRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isNativeApp.mockReturnValue(true);
    mocks.getNativeAudioRoutes.mockResolvedValue(snapshot);
    mocks.listenForNativeAudioRoutes.mockImplementation((cb) => {
      emit = cb;
      return unlisten;
    });
  });

  afterEach(cleanup);

  it("loads the snapshot and follows later events", async () => {
    const { result } = renderHook(() => useNativeAudioRoutes(true));
    expect(result.current).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual(snapshot);

    const next: NativeAudioRoutes = { current: "speaker", available: snapshot.available };
    act(() => {
      emit(next);
    });
    expect(result.current).toEqual(next);
  });

  it("prefers an event that beat the snapshot", async () => {
    const { result } = renderHook(() => useNativeAudioRoutes(true));
    const newer: NativeAudioRoutes = { current: "speaker", available: snapshot.available };
    act(() => {
      emit(newer);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual(newer);
  });

  it("does nothing outside the app, and clears once disabled", async () => {
    mocks.isNativeApp.mockReturnValue(false);
    renderHook(() => useNativeAudioRoutes(true));
    expect(mocks.getNativeAudioRoutes).not.toHaveBeenCalled();

    mocks.isNativeApp.mockReturnValue(true);
    const { result, rerender } = renderHook(({ on }) => useNativeAudioRoutes(on), {
      initialProps: { on: true },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual(snapshot);
    rerender({ on: false });
    expect(result.current).toBeNull();
    expect(unlisten).toHaveBeenCalled();
  });
});
