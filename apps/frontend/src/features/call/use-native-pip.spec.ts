import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNativePip } from "./use-native-pip";

const mocks = vi.hoisted(() => ({
  listenForNativePipMode: vi.fn<(cb: (active: boolean) => void) => () => void>(),
}));

vi.mock("../../shared/native", () => ({
  listenForNativePipMode: mocks.listenForNativePipMode,
}));

describe("useNativePip", () => {
  let emit: (active: boolean) => void;
  const unlisten = vi.fn();

  beforeEach(() => {
    unlisten.mockReset();
    mocks.listenForNativePipMode.mockReset();
    mocks.listenForNativePipMode.mockImplementation((cb) => {
      emit = cb;
      return unlisten;
    });
  });

  afterEach(cleanup);

  it("is false until the shell reports picture-in-picture", () => {
    const { result } = renderHook(() => useNativePip());
    expect(result.current).toBe(false);
  });

  it("follows pipModeChanged events", () => {
    const { result } = renderHook(() => useNativePip());
    act(() => {
      emit(true);
    });
    expect(result.current).toBe(true);
    act(() => {
      emit(false);
    });
    expect(result.current).toBe(false);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useNativePip());
    unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
