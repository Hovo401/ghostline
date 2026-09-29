import { beforeEach, describe, expect, it } from "vitest";

import type { Attachment } from "./attachment.types";
import { useMediaViewerStore } from "./media-viewer-store";

function attachment(id: string): Attachment {
  return {
    id,
    key: `key-${id}`,
    mime: "image/png",
    size: 1024,
    width: 100,
    height: 100,
    name: `${id}.png`,
    url: `https://example.com/${id}.png`,
  };
}

const items = [attachment("a"), attachment("b"), attachment("c")];

beforeEach(() => {
  useMediaViewerStore.setState({ items: [], index: null });
});

describe("useMediaViewerStore", () => {
  it("starts closed", () => {
    expect(useMediaViewerStore.getState().index).toBeNull();
  });

  it("open sets the gallery and index", () => {
    useMediaViewerStore.getState().open(items, 1);
    expect(useMediaViewerStore.getState().items).toEqual(items);
    expect(useMediaViewerStore.getState().index).toBe(1);
  });

  it("close resets items and index", () => {
    useMediaViewerStore.getState().open(items, 1);
    useMediaViewerStore.getState().close();
    expect(useMediaViewerStore.getState().index).toBeNull();
    expect(useMediaViewerStore.getState().items).toEqual([]);
  });

  it("open clamps an out-of-range index into bounds", () => {
    useMediaViewerStore.getState().open(items, 99);
    expect(useMediaViewerStore.getState().index).toBe(items.length - 1);
    useMediaViewerStore.getState().open(items, -5);
    expect(useMediaViewerStore.getState().index).toBe(0);
  });

  it("open with an empty list is a no-op", () => {
    useMediaViewerStore.getState().open([], 0);
    expect(useMediaViewerStore.getState().index).toBeNull();
  });

  it("next advances the index and stops at the last item", () => {
    useMediaViewerStore.getState().open(items, 0);
    useMediaViewerStore.getState().next();
    expect(useMediaViewerStore.getState().index).toBe(1);
    useMediaViewerStore.getState().next();
    expect(useMediaViewerStore.getState().index).toBe(2);
    useMediaViewerStore.getState().next();
    expect(useMediaViewerStore.getState().index).toBe(2);
  });

  it("prev retreats the index and stops at the first item", () => {
    useMediaViewerStore.getState().open(items, 2);
    useMediaViewerStore.getState().prev();
    expect(useMediaViewerStore.getState().index).toBe(1);
    useMediaViewerStore.getState().prev();
    expect(useMediaViewerStore.getState().index).toBe(0);
    useMediaViewerStore.getState().prev();
    expect(useMediaViewerStore.getState().index).toBe(0);
  });

  it("next/prev are no-ops while closed", () => {
    useMediaViewerStore.getState().next();
    expect(useMediaViewerStore.getState().index).toBeNull();
    useMediaViewerStore.getState().prev();
    expect(useMediaViewerStore.getState().index).toBeNull();
  });
});
