/** Typed failure out of `putFileWithProgress` — `upload-errors.ts`'s
 * `describeUploadError` and `upload-queue-store.ts`'s retry logic both
 * dispatch on `code` instead of parsing an `Error.message` string. A real
 * `Error` subclass (not a plain object) so it satisfies
 * `@typescript-eslint/only-throw-error`/`prefer-promise-reject-errors`. */
export class UploadError extends Error {
  constructor(
    public readonly code: "network" | "http" | "aborted",
    public readonly status?: number,
  ) {
    super(`upload failed: ${code}`);
    this.name = "UploadError";
  }
}

export function isUploadError(error: unknown): error is UploadError {
  return error instanceof UploadError;
}

/**
 * PUTs `file` directly to a presigned S3 URL, reporting upload progress as
 * a 0–1 fraction. `fetch` doesn't expose upload progress in browsers, so
 * this is the one place the app reaches for `XMLHttpRequest` instead of
 * `apiFetch` — it also isn't a same-origin `/api/v1` call (the presigned
 * URL points straight at S3/SeaweedFS), so `apiFetch`'s bearer header and
 * JSON body wouldn't apply anyway.
 *
 * `signal` lets a caller (cancel button, retry-with-a-fresh-attempt) abort
 * an in-flight PUT — rejects with a `{code: "aborted"}` `UploadError` rather
 * than "network"/"http" so callers can tell a deliberate cancel apart from a
 * real failure.
 */
export function putFileWithProgress(
  uploadUrl: string,
  file: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadError("aborted"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new UploadError("http", xhr.status));
    };
    xhr.onerror = () => {
      reject(new UploadError("network"));
    };
    xhr.onabort = () => {
      reject(new UploadError("aborted"));
    };

    signal?.addEventListener("abort", () => {
      xhr.abort();
    });

    xhr.send(file);
  });
}
