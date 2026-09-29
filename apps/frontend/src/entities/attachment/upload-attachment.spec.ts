import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../shared/api/http-client";

import { readMediaDimensions } from "./read-media-dimensions";
import { uploadAttachment } from "./upload-attachment";
import { putFileWithProgress, UploadError } from "./upload-file";
import type * as UploadFileModule from "./upload-file";

vi.mock("../../shared/api/http-client", () => ({
  apiFetch: vi.fn(),
}));
vi.mock("./upload-file", async () => {
  const actual = await vi.importActual<typeof UploadFileModule>("./upload-file");
  return { ...actual, putFileWithProgress: vi.fn() };
});
vi.mock("./read-media-dimensions", () => ({
  readMediaDimensions: vi.fn(),
}));

const ATTACHMENT_ID = "11111111-1111-1111-1111-111111111111";

function makeFile(name: string, type: string, content = "x"): File {
  return new File([content], name, { type });
}

function makeAttachmentResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTACHMENT_ID,
    key: "k",
    mime: "application/pdf",
    size: 4,
    width: null,
    height: null,
    name: "doc.pdf",
    url: "https://s3.example/get",
    ...overrides,
  };
}

describe("uploadAttachment", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(putFileWithProgress).mockReset().mockResolvedValue(undefined);
    vi.mocked(readMediaDimensions).mockReset().mockResolvedValue(null);
  });

  it("presigns, uploads and completes a single-mode file attachment", async () => {
    vi.mocked(apiFetch).mockImplementation((path) => {
      if (path === "/attachments/presign") {
        return Promise.resolve({
          attachmentId: ATTACHMENT_ID,
          mode: "single",
          uploadUrl: "https://s3.example/put",
        });
      }
      if (path === `/attachments/${ATTACHMENT_ID}/complete`) {
        return Promise.resolve(makeAttachmentResponse());
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
      undefined,
    );
    expect(result.id).toBe(ATTACHMENT_ID);
  });

  it("reads image dimensions and sends them to /complete", async () => {
    vi.mocked(readMediaDimensions).mockResolvedValue({ width: 800, height: 600 });
    vi.mocked(apiFetch).mockImplementation((path, options) => {
      if (path === "/attachments/presign") {
        return Promise.resolve({
          attachmentId: ATTACHMENT_ID,
          mode: "single",
          uploadUrl: "https://s3.example/put",
        });
      }
      if (path === `/attachments/${ATTACHMENT_ID}/complete`) {
        expect(options?.body).toEqual({ attachmentId: ATTACHMENT_ID, width: 800, height: 600 });
        return Promise.resolve(
          makeAttachmentResponse({ mime: "image/png", width: 800, height: 600, name: "photo.png" }),
        );
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
          mode: "single",
          uploadUrl: "https://s3.example/put",
        });
      }
      return Promise.resolve(makeAttachmentResponse({ mime: "audio/webm", name: null }));
    });

    await uploadAttachment({
      file: makeFile("voice.webm", "audio/webm"),
      fileName: "voice.webm",
      kind: "voice",
    });

    expect(readMediaDimensions).not.toHaveBeenCalled();
  });

  it("uploads a multipart attachment in parts and completes it", async () => {
    const partSize = 5;
    const fileContent = "a".repeat(12); // 3 parts: 5, 5, 2
    const partCalls: number[][] = [];

    vi.mocked(apiFetch).mockImplementation((path, options) => {
      if (path === "/attachments/presign") {
        return Promise.resolve({
          attachmentId: ATTACHMENT_ID,
          mode: "multipart",
          partSize,
          partCount: 3,
        });
      }
      if (path === `/attachments/${ATTACHMENT_ID}/parts`) {
        const body = options?.body as { partNumbers: number[] };
        partCalls.push(body.partNumbers);
        return Promise.resolve({
          parts: body.partNumbers.map((partNumber) => ({
            partNumber,
            url: `https://s3.example/part${partNumber.toFixed(0)}`,
          })),
        });
      }
      if (path === `/attachments/${ATTACHMENT_ID}/complete`) {
        return Promise.resolve(makeAttachmentResponse({ size: fileContent.length }));
      }
      throw new Error(`unexpected path ${path}`);
    });

    const onProgress = vi.fn();
    const onPartDone = vi.fn();
    const result = await uploadAttachment({
      file: makeFile("video.mp4", "video/mp4", fileContent),
      fileName: "video.mp4",
      kind: "video",
      onProgress,
      onPartDone,
    });

    expect(partCalls).toEqual([[1, 2, 3]]);
    expect(putFileWithProgress).toHaveBeenCalledTimes(3);
    expect(onPartDone).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledWith(fileContent.length, fileContent.length);
    expect(result.id).toBe(ATTACHMENT_ID);
  });

  it("resumes a multipart upload by skipping already-done parts", async () => {
    const partSize = 5;
    const fileContent = "a".repeat(12);
    const partCalls: number[][] = [];

    vi.mocked(apiFetch).mockImplementation((path, options) => {
      if (path === "/attachments/presign") {
        return Promise.resolve({
          attachmentId: ATTACHMENT_ID,
          mode: "multipart",
          partSize,
          partCount: 3,
        });
      }
      if (path === `/attachments/${ATTACHMENT_ID}/parts`) {
        const body = options?.body as { partNumbers: number[] };
        partCalls.push(body.partNumbers);
        return Promise.resolve({
          parts: body.partNumbers.map((partNumber) => ({
            partNumber,
            url: `https://s3.example/part${partNumber.toFixed(0)}`,
          })),
        });
      }
      return Promise.resolve(makeAttachmentResponse({ size: fileContent.length }));
    });

    await uploadAttachment({
      file: makeFile("video.mp4", "video/mp4", fileContent),
      fileName: "video.mp4",
      kind: "video",
      doneParts: new Set([1, 2]),
    });

    expect(partCalls).toEqual([[3]]);
    expect(putFileWithProgress).toHaveBeenCalledTimes(1);
  });

  it("retries a failed part before giving up", async () => {
    const partSize = 5;
    const fileContent = "a".repeat(5);

    vi.mocked(apiFetch).mockImplementation((path, options) => {
      if (path === "/attachments/presign") {
        return Promise.resolve({
          attachmentId: ATTACHMENT_ID,
          mode: "multipart",
          partSize,
          partCount: 1,
        });
      }
      if (path === `/attachments/${ATTACHMENT_ID}/parts`) {
        const body = options?.body as { partNumbers: number[] };
        return Promise.resolve({
          parts: body.partNumbers.map((partNumber) => ({
            partNumber,
            url: `https://s3.example/part${partNumber.toFixed(0)}`,
          })),
        });
      }
      return Promise.resolve(makeAttachmentResponse({ size: fileContent.length }));
    });
    vi.mocked(putFileWithProgress)
      .mockRejectedValueOnce(new UploadError("network"))
      .mockResolvedValueOnce(undefined);

    const result = await uploadAttachment({
      file: makeFile("video.mp4", "video/mp4", fileContent),
      fileName: "video.mp4",
      kind: "video",
    });

    expect(putFileWithProgress).toHaveBeenCalledTimes(2);
    expect(result.id).toBe(ATTACHMENT_ID);
  });

  it("propagates an aborted part without retrying", async () => {
    const partSize = 5;
    const fileContent = "a".repeat(5);

    vi.mocked(apiFetch).mockImplementation((path, options) => {
      if (path === "/attachments/presign") {
        return Promise.resolve({
          attachmentId: ATTACHMENT_ID,
          mode: "multipart",
          partSize,
          partCount: 1,
        });
      }
      const body = options?.body as { partNumbers: number[] };
      return Promise.resolve({
        parts: body.partNumbers.map((partNumber) => ({ partNumber, url: "https://s3.example/p" })),
      });
    });
    vi.mocked(putFileWithProgress).mockRejectedValue(new UploadError("aborted"));

    await expect(
      uploadAttachment({
        file: makeFile("video.mp4", "video/mp4", fileContent),
        fileName: "video.mp4",
        kind: "video",
      }),
    ).rejects.toMatchObject({ code: "aborted" });

    expect(putFileWithProgress).toHaveBeenCalledTimes(1);
  });
});
