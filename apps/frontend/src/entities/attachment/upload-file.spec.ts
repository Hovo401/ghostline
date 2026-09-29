import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { putFileWithProgress } from "./upload-file";

class FakeXhr {
  static instances: FakeXhr[] = [];
  status = 200;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  abort = vi.fn(() => {
    this.onabort?.();
  });

  constructor() {
    FakeXhr.instances.push(this);
  }
}

function lastXhr(): FakeXhr {
  const xhr = FakeXhr.instances.at(-1);
  if (!xhr) throw new Error("no XMLHttpRequest was constructed");
  return xhr;
}

describe("putFileWithProgress", () => {
  beforeEach(() => {
    FakeXhr.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs to the presigned URL with the given content type", async () => {
    const promise = putFileWithProgress("https://s3.example/upload", new Blob(["a"]), "image/png");
    const xhr = lastXhr();
    expect(xhr.open).toHaveBeenCalledWith("PUT", "https://s3.example/upload", true);
    expect(xhr.setRequestHeader).toHaveBeenCalledWith("Content-Type", "image/png");

    xhr.onload?.();
    await expect(promise).resolves.toBeUndefined();
  });

  it("reports progress as a 0-1 fraction", async () => {
    const onProgress = vi.fn();
    const promise = putFileWithProgress(
      "https://s3.example/upload",
      new Blob(["a"]),
      "image/png",
      onProgress,
    );
    const xhr = lastXhr();
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
    expect(onProgress).toHaveBeenCalledWith(0.5);

    xhr.onload?.();
    await promise;
  });

  it("rejects with a typed http error on a non-2xx status", async () => {
    const promise = putFileWithProgress("https://s3.example/upload", new Blob(["a"]), "image/png");
    const xhr = lastXhr();
    xhr.status = 500;

    xhr.onload?.();
    await expect(promise).rejects.toMatchObject({ code: "http", status: 500 });
  });

  it("rejects with a typed network error on a transport error", async () => {
    const promise = putFileWithProgress("https://s3.example/upload", new Blob(["a"]), "image/png");
    const xhr = lastXhr();

    xhr.onerror?.();
    await expect(promise).rejects.toMatchObject({ code: "network" });
  });

  it("rejects with a typed aborted error when the signal aborts mid-flight", async () => {
    const controller = new AbortController();
    const promise = putFileWithProgress(
      "https://s3.example/upload",
      new Blob(["a"]),
      "image/png",
      undefined,
      controller.signal,
    );
    controller.abort();

    await expect(promise).rejects.toMatchObject({ code: "aborted" });
  });

  it("rejects immediately if the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const promise = putFileWithProgress(
      "https://s3.example/upload",
      new Blob(["a"]),
      "image/png",
      undefined,
      controller.signal,
    );

    await expect(promise).rejects.toMatchObject({ code: "aborted" });
  });
});
