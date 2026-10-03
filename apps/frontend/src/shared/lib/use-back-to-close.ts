import { type RouterHistory, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** Tags the same-URL entry `useBackToClose` pushes for one open overlay. */
    glOverlay?: string;
  }
}

/** How long a self-initiated `history.back()` may take to land before a
 * waiting push stops waiting for it — `popstate` is async in browsers. */
const BACK_SETTLE_MS = 400;

let nextOverlayId = 0;

/** Set while a `back()` this module issued hasn't landed yet. A push made
 * in that window would be the entry the pending back then pops — e.g. a
 * context menu closing straight into a dialog — so pushes wait on it. */
let pendingBack: Promise<void> | null = null;

function backAndSettle(history: RouterHistory): void {
  const settled = new Promise<void>((resolve) => {
    const finish = (): void => {
      unsubscribe();
      clearTimeout(timer);
      resolve();
    };
    const unsubscribe = history.subscribe(finish);
    const timer = setTimeout(finish, BACK_SETTLE_MS);
  });
  pendingBack = settled;
  void settled.then(() => {
    if (pendingBack === settled) pendingBack = null;
  });
  // The browser history defers `pushState` to a microtask; an overlay
  // opened and closed in the same tick (StrictMode's double effect, a
  // click-through) would otherwise `back()` past the entry it hasn't
  // written yet and pop the screen underneath.
  history.flush();
  history.back();
}

/**
 * Makes an overlay (modal, side panel, popover, fullscreen viewer) part of
 * browser history, the way Telegram does: opening it pushes a same-URL
 * entry, the system/browser Back closes it instead of leaving the screen,
 * and closing it any other way (✕, Esc, backdrop click) pops that entry so
 * no dead step is left behind. Overlays stack — one opened on top of
 * another gets its own entry above it, and Back peels them off in order.
 *
 * `onClose` must only update state; it's called when the entry is popped
 * (Back) or replaced (a navigation over it, e.g. opening a chat from the
 * "new chat" modal), never to trigger another history change.
 */
export function useBackToClose(open: boolean, onClose: () => void): void {
  // `shared/ui` primitives also render outside any router (component specs)
  // — there they're plain overlays with no history entry.
  const router = useRouter({ warn: false }) as { history: RouterHistory } | undefined;
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open || !router) return;
    const history = router.history;
    nextOverlayId += 1;
    const id = `overlay-${String(nextOverlayId)}`;
    let cancelled = false;
    let closedByHistory = false;
    let unsubscribe = (): void => undefined;

    const pushEntry = (): void => {
      if (cancelled) return;
      const { href, state } = history.location;
      const { __TSR_index: _index, __TSR_key: _tsrKey, key: _key, ...userState } = state;
      history.push(href, { ...userState, glOverlay: id });
      const entryIndex = history.location.state.__TSR_index;

      unsubscribe = history.subscribe(({ location }) => {
        const index = location.state.__TSR_index;
        // Another overlay (or page) stacked on top — still open underneath.
        if (index > entryIndex) return;
        if (index === entryIndex && location.state.glOverlay === id) return;
        closedByHistory = true;
        unsubscribe();
        onCloseRef.current();
      });
    };

    if (pendingBack) void pendingBack.then(pushEntry);
    else pushEntry();

    return () => {
      cancelled = true;
      unsubscribe();
      if (!closedByHistory && history.location.state.glOverlay === id) backAndSettle(history);
    };
  }, [open, router]);
}
