import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useZoomPan } from "./use-zoom-pan";

function wheelEvent(deltaY: number): React.WheelEvent {
  return { deltaY, preventDefault: vi.fn() } as unknown as React.WheelEvent;
}

function pointerEvent(pointerId: number, x: number, y: number): React.PointerEvent {
  return { pointerId, clientX: x, clientY: y } as unknown as React.PointerEvent;
}

describe("useZoomPan", () => {
  it("starts at scale 1 with no offset", () => {
    const { result } = renderHook(() => useZoomPan());
    expect(result.current.scale).toBe(1);
    expect(result.current.x).toBe(0);
    expect(result.current.y).toBe(0);
  });

  it("wheel scrolling up zooms in, clamped to the 1x-4x range", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => {
      result.current.handlers.onWheel(wheelEvent(-1000));
    });
    expect(result.current.scale).toBeGreaterThan(1);

    act(() => {
      for (let i = 0; i < 50; i += 1) result.current.handlers.onWheel(wheelEvent(-1000));
    });
    expect(result.current.scale).toBeLessThanOrEqual(4);
  });

  it("wheel scrolling down never zooms below 1x", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => {
      result.current.handlers.onWheel(wheelEvent(1000));
    });
    expect(result.current.scale).toBe(1);
  });

  it("double click toggles between 1x and 2x", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => {
      result.current.handlers.onDoubleClick();
    });
    expect(result.current.scale).toBe(2);
    act(() => {
      result.current.handlers.onDoubleClick();
    });
    expect(result.current.scale).toBe(1);
  });

  it("reset returns to scale 1 and clears offset", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => {
      result.current.handlers.onDoubleClick();
    });
    expect(result.current.scale).toBe(2);
    act(() => {
      result.current.reset();
    });
    expect(result.current.scale).toBe(1);
    expect(result.current.x).toBe(0);
    expect(result.current.y).toBe(0);
  });

  it("dragging at scale 1 does not pan (nothing to consume)", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => {
      result.current.handlers.onPointerDown(pointerEvent(1, 100, 100));
      result.current.handlers.onPointerMove(pointerEvent(1, 40, 100));
      result.current.handlers.onPointerUp(pointerEvent(1, 40, 100));
    });
    expect(result.current.x).toBe(0);
  });

  it("dragging while zoomed in pans the image", () => {
    const { result } = renderHook(() => useZoomPan());
    act(() => {
      result.current.handlers.onDoubleClick();
    });
    act(() => {
      result.current.handlers.onPointerDown(pointerEvent(1, 100, 100));
      result.current.handlers.onPointerMove(pointerEvent(1, 140, 130));
    });
    expect(result.current.x).toBe(40);
    expect(result.current.y).toBe(30);
  });

  it("a left swipe at scale 1 triggers onSwipeLeft", () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() => useZoomPan({ onSwipeLeft, onSwipeRight }));
    act(() => {
      result.current.handlers.onPointerDown(pointerEvent(1, 300, 100));
      result.current.handlers.onPointerMove(pointerEvent(1, 200, 100));
      result.current.handlers.onPointerUp(pointerEvent(1, 200, 100));
    });
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("a right swipe at scale 1 triggers onSwipeRight", () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() => useZoomPan({ onSwipeLeft, onSwipeRight }));
    act(() => {
      result.current.handlers.onPointerDown(pointerEvent(1, 100, 100));
      result.current.handlers.onPointerMove(pointerEvent(1, 200, 100));
      result.current.handlers.onPointerUp(pointerEvent(1, 200, 100));
    });
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });
});
