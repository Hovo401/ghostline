import { useEffect, useRef, type PointerEvent } from "react";

const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/**
 * Touch long-press → `onLongPress(x, y)` (FR-MSG-11). iOS Safari fires no
 * `contextmenu` on a long press, so the bubble needs its own timer; mouse
 * and pen are left to the regular right-click `contextmenu`. Moving the
 * finger (a scroll) cancels it.
 */
export function useLongPress(onLongPress: (x: number, y: number) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef({ x: 0, y: 0 });

  const cancel = (): void => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };

  useEffect(() => cancel, []);

  return {
    onPointerDown: (event: PointerEvent): void => {
      if (event.pointerType !== "touch") return;
      const { clientX: x, clientY: y } = event;
      start.current = { x, y };
      cancel();
      timer.current = setTimeout(() => {
        timer.current = undefined;
        onLongPress(x, y);
      }, HOLD_MS);
    },
    onPointerMove: (event: PointerEvent): void => {
      if (timer.current === undefined) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  };
}
