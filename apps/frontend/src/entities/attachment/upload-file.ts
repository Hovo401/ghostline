/**
 * PUTs `file` directly to a presigned S3 URL, reporting upload progress as
 * a 0–1 fraction. `fetch` doesn't expose upload progress in browsers, so
 * this is the one place the app reaches for `XMLHttpRequest` instead of
 * `apiFetch` — it also isn't a same-origin `/api/v1` call (the presigned
 * URL points straight at S3/SeaweedFS), so `apiFetch`'s bearer header and
 * JSON body wouldn't apply anyway.
 */
export function putFileWithProgress(
  uploadUrl: string,
  file: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload failed with status ${xhr.status.toFixed(0)}`));
    };
    xhr.onerror = () => {
      reject(new Error("upload failed"));
    };
    xhr.send(file);
  });
}
