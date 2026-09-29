import { useCallback, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_CLICK_SCALE = 2;
const WHEEL_SCALE_STEP = 0.0015;
const SWIPE_THRESHOLD_PX = 60;

interface Point {
  x: number;
  y: number;
}

interface ZoomPanTransform {
  scale: number;
  x: number;
  y: number;
}

interface UseZoomPanOptions {
  /** Horizontal swipe at scale=1 (no pan to consume) triggers gallery nav. */
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Pulls the two active pointers out of the tracking map — only called
 * once `pointers.current.size === 2` is confirmed, but `noUncheckedIndexedAccess`
 * still needs the explicit check. */
function twoPointers(pointers: Map<number, Point>): [Point, Point] | null {
  const values = [...pointers.values()];
  const a = values[0];
  const b = values[1];
  if (!a || !b) return null;
  return [a, b];
}

/**
 * Pointer-events-only zoom/pan for the fullscreen media viewer (T-033,
 * FR-MEDIA-09) — wheel zoom, double-click toggle, two-pointer pinch, drag
 * panning once zoomed in, and a horizontal-swipe callback for gallery
 * navigation when there's nothing to pan (scale is back at 1×). No new
 * dependency — everything here is native Pointer/WheelEvent.
 */
export function useZoomPan({ onSwipeLeft, onSwipeRight }: UseZoomPanOptions = {}) {
  const [transform, setTransform] = useState<ZoomPanTransform>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const dragStart = useRef<Point | null>(null);
  const transformStart = useRef<ZoomPanTransform>({ scale: 1, x: 0, y: 0 });
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);
  const swipeStart = useRef<Point | null>(null);

  const reset = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
    pointers.current.clear();
    dragStart.current = null;
    swipeStart.current = null;
  }, []);

  const onWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    setTransform((prev) => ({
      ...prev,
      scale: clampScale(prev.scale - event.deltaY * WHEEL_SCALE_STEP * prev.scale),
    }));
  }, []);

  const onDoubleClick = useCallback(() => {
    setTransform((prev) =>
      prev.scale > MIN_SCALE
        ? { scale: MIN_SCALE, x: 0, y: 0 }
        : { scale: DOUBLE_CLICK_SCALE, x: 0, y: 0 },
    );
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 2) {
        const pair = twoPointers(pointers.current);
        if (pair) {
          pinchStartDistance.current = distance(pair[0], pair[1]);
          pinchStartScale.current = transform.scale;
        }
        dragStart.current = null;
        swipeStart.current = null;
        return;
      }
      if (pointers.current.size === 1) {
        dragStart.current = { x: event.clientX, y: event.clientY };
        transformStart.current = transform;
        swipeStart.current = { x: event.clientX, y: event.clientY };
      }
    },
    [transform],
  );

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      const pair = twoPointers(pointers.current);
      if (pair && pinchStartDistance.current > 0) {
        const nextDistance = distance(pair[0], pair[1]);
        const nextScale = clampScale(
          pinchStartScale.current * (nextDistance / pinchStartDistance.current),
        );
        setTransform((prev) => ({ ...prev, scale: nextScale }));
      }
      return;
    }

    if (dragStart.current && transformStart.current.scale > MIN_SCALE) {
      const dx = event.clientX - dragStart.current.x;
      const dy = event.clientY - dragStart.current.y;
      setTransform((prev) => ({
        ...prev,
        x: transformStart.current.x + dx,
        y: transformStart.current.y + dy,
      }));
    }
  }, []);

  const endGesture = useCallback(
    (event: React.PointerEvent) => {
      const wasSingle = pointers.current.size === 1;
      pointers.current.delete(event.pointerId);

      if (wasSingle && swipeStart.current && transformStart.current.scale === MIN_SCALE) {
        const dx = event.clientX - swipeStart.current.x;
        const dy = event.clientY - swipeStart.current.y;
        if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) onSwipeLeft?.();
          else onSwipeRight?.();
        }
      }

      dragStart.current = null;
      swipeStart.current = null;
      pinchStartDistance.current = 0;
    },
    [onSwipeLeft, onSwipeRight],
  );

  return {
    scale: transform.scale,
    x: transform.x,
    y: transform.y,
    reset,
    handlers: {
      onWheel,
      onDoubleClick,
      onPointerDown,
      onPointerMove,
      onPointerUp: endGesture,
      onPointerLeave: endGesture,
      onPointerCancel: endGesture,
    },
  };
}
