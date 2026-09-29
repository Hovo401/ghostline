import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Attachment } from "../../entities/attachment";
import { useMediaViewerStore } from "../../entities/attachment";
import { apiFetch } from "../../shared/api/http-client";
import type * as HttpClientModule from "../../shared/api/http-client";

import { MediaViewer } from "./MediaViewer";

vi.mock("../../shared/api/http-client", async () => {
  const actual = await vi.importActual<typeof HttpClientModule>("../../shared/api/http-client");
  return { ...actual, apiFetch: vi.fn() };
});

function attachment(id: string): Attachment {
  return {
    id,
    key: `key-${id}`,
    mime: "image/png",
    size: 2048,
    width: 800,
    height: 600,
    name: `${id}.png`,
    url: `https://example.com/${id}.png`,
  };
}

const items = [attachment("a"), attachment("b"), attachment("c")];

beforeEach(() => {
  useMediaViewerStore.setState({ items: [], index: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MediaViewer", () => {
  it("renders nothing while closed", () => {
    render(<MediaViewer />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog with the current image and a 1-based counter", async () => {
    useMediaViewerStore.getState().open(items, 1);
    render(<MediaViewer />);

    expect(screen.getByRole("dialog", { name: "Просмотр изображения" })).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    // Not in the media cache (jsdom has no Cache Storage) → the plain URL.
    expect(await screen.findByRole("img")).toHaveAttribute("src", items[1]?.url);
  });

  it("Escape closes the viewer", () => {
    useMediaViewerStore.getState().open(items, 0);
    render(<MediaViewer />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(useMediaViewerStore.getState().index).toBeNull();
  });

  it("clicking the close button closes the viewer", () => {
    useMediaViewerStore.getState().open(items, 0);
    render(<MediaViewer />);

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(useMediaViewerStore.getState().index).toBeNull();
  });

  it("clicking the backdrop closes the viewer", () => {
    useMediaViewerStore.getState().open(items, 0);
    render(<MediaViewer />);

    fireEvent.click(screen.getByTestId("media-viewer-backdrop"));
    expect(useMediaViewerStore.getState().index).toBeNull();
  });

  it("clicking the image itself does not close the viewer", () => {
    useMediaViewerStore.getState().open(items, 0);
    render(<MediaViewer />);

    fireEvent.click(screen.getByRole("img"));
    expect(useMediaViewerStore.getState().index).toBe(0);
  });

  it("ArrowRight/ArrowLeft page through the gallery and the counter updates", () => {
    useMediaViewerStore.getState().open(items, 0);
    render(<MediaViewer />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("hides the previous/next arrows at the first/last item", () => {
    useMediaViewerStore.getState().open(items, 0);
    const { rerender } = render(<MediaViewer />);
    expect(screen.queryByRole("button", { name: "Предыдущее фото" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Следующее фото" })).toBeInTheDocument();

    useMediaViewerStore.getState().open(items, 2);
    rerender(<MediaViewer />);
    expect(screen.getByRole("button", { name: "Предыдущее фото" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Следующее фото" })).not.toBeInTheDocument();
  });

  it("the download button re-fetches a fresh attachment URL and triggers a save", async () => {
    const fresh = {
      ...items[0],
      id: "11111111-1111-1111-1111-111111111111",
      url: "https://example.com/fresh-a.png",
    };
    vi.mocked(apiFetch).mockResolvedValue(fresh);
    let clickedHref: string | null = null;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedHref = this.href;
    });

    useMediaViewerStore.getState().open(items, 0);
    render(<MediaViewer />);

    fireEvent.click(screen.getByRole("button", { name: "Скачать" }));
    await vi.waitFor(() => {
      expect(clickSpy).toHaveBeenCalled();
    });

    expect(apiFetch).toHaveBeenCalledWith(`/attachments/${items[0]?.id ?? ""}`);
    expect(clickedHref).toBe(fresh.url);
  });
});
