import { create } from "zustand";

import type { Attachment } from "./attachment.types";

/**
 * Fullscreen media viewer's client-only state (T-033, FR-MEDIA-09) — which
 * gallery is open (the ordered list of image attachments the user was
 * looking at, chat feed or profile panel "Медиа" grid) and which index in
 * it. Lives in `entities/attachment` rather than `features/media-viewer`
 * because `features/chat`/`ProfilePanel` need to call `open()` and
 * `features` can't import a sibling `feature` (apps/frontend/CLAUDE.md
 * layering) — only the `<MediaViewer/>` component itself lives in the
 * feature, mounted once from the route layout.
 */
interface MediaViewerState {
  items: Attachment[];
  index: number | null;
  open: (items: Attachment[], index: number) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
}

export const useMediaViewerStore = create<MediaViewerState>((set, get) => ({
  items: [],
  index: null,
  open: (items, index) => {
    if (items.length === 0) return;
    set({ items, index: Math.min(Math.max(index, 0), items.length - 1) });
  },
  close: () => {
    set({ items: [], index: null });
  },
  next: () => {
    const { items, index } = get();
    if (index === null) return;
    set({ index: Math.min(index + 1, items.length - 1) });
  },
  prev: () => {
    const { index } = get();
    if (index === null) return;
    set({ index: Math.max(index - 1, 0) });
  },
}));
