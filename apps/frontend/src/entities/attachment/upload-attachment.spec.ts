import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";

import { readMediaDimensions } from "./read-media-dimensions";
import { uploadAttachment } from "./upload-attachment";
import { putFileWithProgress } from "./upload-file";

vi.mock("../../shared/api/http-client", () => ({
  apiFetch: vi.fn(),
}));
vi.mock("./upload-file", () => ({
  putFileWithProgress: vi.fn(),
}));
vi.mock("./read-media-dimensions", () => ({
  readMediaDimensions: vi.fn(),
}));

const ATTACHMENT_ID = "11111111-1111-1111-1111-111111111111";

function makeFile(name: string, type: string, content = "x"): File {
  return new File([content], name, { type });
}

describe("uploadAttachment", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(putFileWithProgress).mockReset().mockResolvedValue(undefined);
    vi.mocked(readMediaDimensions).mockReset().mockResolvedValue(null);
  });

  it("presigns, uploads and completes a file attachment", async () => {
    vi.mocked(apiFetch).mockImplementation((path) => {
      if (path === "/attachments/presign") {
        return Promise.resolve({
          attachmentId: ATTACHMENT_ID,
          uploadUrl: "https://s3.example/put",
        });
      }
      if (path === `/attachments/${ATTACHMENT_ID}/complete`) {
        return Promise.resolve({
          id: ATTACHMENT_ID,
          key: "k",
          mime: "application/pdf",
          size: 4,
          width: null,
          height: null,
          name: "doc.pdf",
          url: "https://s3.example/get",
        });
      }
      throw new Error(`unexpected path ${path}`);
    });

    const result = await uploadAttachment({
      file: makeFile("doc.pdf", "application/pdf"),
      fileName: "doc.pdf",
      kind: "file",
    });

    expect(apiFetch).toHaveBeenCalledWith("/attachments/presign", {
      method: "POST",
      body: { kind: "file", mime: "application/pdf", size: 1, fileName: "doc.pdf" },
    });
    expect(putFileWithProgress).toHaveBeenCalledWith(
      "https://s3.example/put",
      expect.anything(),
      "application/pdf",
      undefined,
    );
    expect(result.id).toBe(ATTACHMENT_ID);
    expect(result.url).toBe("https://s3.example/get");
  });

  it("reads image dimensions and sends them to /complete", async () => {
    vi.mocked(readMediaDimensions).mockResolvedValue({ width: 800, height: 600 });
    vi.mocked(apiFetch).mockImplementation((path, options) => {
      if (path === "/attachments/presign") {
        return Promise.resolve({
          attachmentId: ATTACHMENT_ID,
          uploadUrl: "https://s3.example/put",
        });
      }
      if (path === `/attachments/${ATTACHMENT_ID}/complete`) {
        expect(options?.body).toEqual({ attachmentId: ATTACHMENT_ID, width: 800, height: 600 });
        return Promise.resolve({
          id: ATTACHMENT_ID,
          key: "k",
          mime: "image/png",
          size: 1,
          width: 800,
          height: 600,
          name: "photo.png",
          url: "https://s3.example/get",
        });
      }
      throw new Error(`unexpected path ${path}`);
    });

    await uploadAttachment({
      file: makeFile("photo.png", "image/png"),
      fileName: "photo.png",
      kind: "image",
    });

    expect(readMediaDimensions).toHaveBeenCalledWith(expect.anything(), "image");
  });

  it("does not read dimensions for a voice attachment", async () => {
    vi.mocked(apiFetch).mockImplementation((path) => {
      if (path === "/attachments/presign") {
        return Promise.resolve({
          attachmentId: ATTACHMENT_ID,
          uploadUrl: "https://s3.example/put",
        });
      }
      return Promise.resolve({
        id: ATTACHMENT_ID,
        key: "k",
        mime: "audio/webm",
        size: 1,
        width: null,
        height: null,
        name: null,
        url: "https://s3.example/get",
      });
    });

    await uploadAttachment({
      file: makeFile("voice.webm", "audio/webm"),
      fileName: "voice.webm",
      kind: "voice",
    });

    expect(readMediaDimensions).not.toHaveBeenCalled();
  });
});
