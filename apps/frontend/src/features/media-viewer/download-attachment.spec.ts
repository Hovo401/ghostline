import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadAttachment } from "./download-attachment";

describe("downloadAttachment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fetches the URL and clicks a blob-URL anchor with the given filename", async () => {
    const blob = new Blob(["data"]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }),
    );
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const clickSpy = vi.fn();
    const anchor = document.createElement("a");
    anchor.click = clickSpy;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    await downloadAttachment("https://cdn.example.com/photo.png", "photo.png");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toContain("blob:mock-url");
    expect(anchor.download).toBe("photo.png");
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("falls back to a direct anchor when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const clickSpy = vi.fn();
    const anchor = document.createElement("a");
    anchor.click = clickSpy;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    await downloadAttachment("https://cdn.example.com/photo.png", "photo.png");

    expect(anchor.href).toBe("https://cdn.example.com/photo.png");
    expect(anchor.download).toBe("photo.png");
    expect(clickSpy).toHaveBeenCalled();
  });
});
