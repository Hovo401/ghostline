import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { putFileWithProgress } from "./upload-file";

class FakeXhr {
  static instances: FakeXhr[] = [];
  status = 200;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();

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

  it("rejects on a non-2xx status", async () => {
    const promise = putFileWithProgress("https://s3.example/upload", new Blob(["a"]), "image/png");
    const xhr = lastXhr();
    xhr.status = 500;

    xhr.onload?.();
    await expect(promise).rejects.toThrow(/500/);
  });

  it("rejects on a transport error", async () => {
    const promise = putFileWithProgress("https://s3.example/upload", new Blob(["a"]), "image/png");
    const xhr = lastXhr();

    xhr.onerror?.();
    await expect(promise).rejects.toThrow(/upload failed/);
  });
});
