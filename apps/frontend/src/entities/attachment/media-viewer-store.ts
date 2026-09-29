import { create } from "zustand";

import type { Attachment } from "./attachment.types";

export type MediaViewerMode = "gallery" | "text";

/**
 * Fullscreen media viewer's client-only state (T-033, FR-MEDIA-09) — either
 * an image/video gallery (the ordered list the user was looking at, chat
 * feed or profile panel "Медиа" grid) with an index into it, or a single
 * attachment opened in the text-preview mode (T-032 §4.5, `FileBubble`'s
 * "Просмотр" for txt/md/log/json/csv). Lives in `entities/attachment`
 * rather than `features/media-viewer` because `features/chat`/`ProfilePanel`
 * need to call `open()`/`openText()` and `features` can't import a sibling
 * `feature` (apps/frontend/CLAUDE.md layering) — only the `<MediaViewer/>`
 * component itself lives in the feature, mounted once from the route
 * layout.
 */
interface MediaViewerState {
  mode: MediaViewerMode | null;
  items: Attachment[];
  index: number | null;
  textAttachment: Attachment | null;
  /** Video note (кружок) — the viewer shows it as a circle, not a rectangle. */
  round: boolean;
  open: (items: Attachment[], index: number, options?: { round?: boolean }) => void;
  openText: (attachment: Attachment) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
}

export const useMediaViewerStore = create<MediaViewerState>((set, get) => ({
  mode: null,
  items: [],
  index: null,
  textAttachment: null,
  round: false,
  open: (items, index, options) => {
    if (items.length === 0) return;
    set({
      mode: "gallery",
      items,
      index: Math.min(Math.max(index, 0), items.length - 1),
      textAttachment: null,
      round: options?.round ?? false,
    });
  },
  openText: (attachment) => {
    set({ mode: "text", textAttachment: attachment, items: [], index: null, round: false });
  },
  close: () => {
    set({ mode: null, items: [], index: null, textAttachment: null, round: false });
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
