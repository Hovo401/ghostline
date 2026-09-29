import type { Attachment } from "@ghostline/contracts";

import { isCacheableMedia, putCachedMedia } from "./media-cache";
import { refreshAttachment } from "./use-attachment-actions";

/** "high" — the user tapped it or it just arrived; "low" — auto-download of
 * visible history. High always jumps the queue. */
export type MediaPriority = "high" | "low";

export type MediaProgressListener = (loaded: number, total: number) => void;

export interface MediaRequest {
  promise: Promise<Blob>;
  /** Raise a queued request to "high" (the user tapped a bubble that was
   * already waiting for auto-download). */
  prioritize: () => void;
  /** This subscriber no longer needs it (scrolled away / unmounted) — a
   * request nobody needs is dropped if it hasn't started; a started one
   * finishes so its bytes still land in the cache. Idempotent. */
  release: () => void;
  /** User-initiated cancel — aborts even a running download. */
  abort: () => void;
}

interface Task {
  attachment: Attachment;
  priority: MediaPriority;
  controller: AbortController;
  listeners: Set<MediaProgressListener>;
  subscribers: number;
  started: boolean;
  promise: Promise<Blob>;
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
}

const MAX_CONCURRENT = 3;
const tasks = new Map<string, Task>();
let active = 0;

function abortError(): DOMException {
  return new DOMException("Media download aborted", "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchWithProgress(
  url: string,
  fallbackTotal: number,
  signal: AbortSignal,
  onProgress: MediaProgressListener,
): Promise<Response | Blob> {
  const response = await fetch(url, { signal });
  if (!response.ok) return response;
  const total = Number(response.headers.get("Content-Length")) || fallbackTotal;
  const type = response.headers.get("Content-Type") ?? "";
  if (!response.body) return new Blob([await response.arrayBuffer()], { type });

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  return new Blob(chunks as BlobPart[], { type });
}

async function download(task: Task): Promise<Blob> {
  const notify: MediaProgressListener = (loaded, total) => {
    for (const listener of task.listeners) listener(loaded, total);
  };
  const { signal } = task.controller;
  let result = await fetchWithProgress(task.attachment.url, task.attachment.size, signal, notify);
  // An expired presigned URL (history loaded >10 min ago) — sign a fresh one once.
  if (result instanceof Response && (result.status === 403 || result.status === 400)) {
    const fresh = await refreshAttachment(task.attachment.id);
    result = await fetchWithProgress(fresh.url, task.attachment.size, signal, notify);
  }
  if (result instanceof Response)
    throw new Error(`media fetch failed: ${result.status.toString()}`);
  return result;
}

function nextQueued(): Task | undefined {
  let firstLow: Task | undefined;
  for (const task of tasks.values()) {
    if (task.started) continue;
    if (task.priority === "high") return task;
    firstLow ??= task;
  }
  return firstLow;
}

function pump(): void {
  while (active < MAX_CONCURRENT) {
    const task = nextQueued();
    if (!task) return;
    task.started = true;
    active += 1;
    download(task)
      .then(async (blob) => {
        if (isCacheableMedia(task.attachment.mime, blob.size)) {
          await putCachedMedia(task.attachment.id, blob);
        }
        task.resolve(blob);
      }, task.reject)
      .finally(() => {
        active -= 1;
        if (tasks.get(task.attachment.id) === task) tasks.delete(task.attachment.id);
        pump();
      });
  }
}

function drop(task: Task): void {
  if (tasks.get(task.attachment.id) === task) tasks.delete(task.attachment.id);
  task.controller.abort();
  task.reject(abortError());
}

/**
 * Bounded, prioritized, de-duplicated media download queue (docs/adr/0013):
 * at most 3 downloads at once, so on a slow link the photo the user is
 * looking at isn't fighting 40 others. A second request for the same
 * attachment shares the first one's download. The result is written to
 * `media-cache` when it's small enough to keep.
 */
export function requestMedia(
  attachment: Attachment,
  priority: MediaPriority,
  onProgress?: MediaProgressListener,
): MediaRequest {
  let task = tasks.get(attachment.id);
  if (!task) {
    let resolve!: (blob: Blob) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Blob>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    task = {
      attachment,
      priority,
      controller: new AbortController(),
      listeners: new Set(),
      subscribers: 0,
      started: false,
      promise,
      resolve,
      reject,
    };
    tasks.set(attachment.id, task);
  } else if (priority === "high") {
    task.priority = "high";
  }

  const current = task;
  current.subscribers += 1;
  if (onProgress) current.listeners.add(onProgress);
  let released = false;
  const unsubscribe = (): boolean => {
    if (released) return false;
    released = true;
    current.subscribers -= 1;
    if (onProgress) current.listeners.delete(onProgress);
    return true;
  };

  pump();

  return {
    promise: current.promise,
    prioritize: () => {
      current.priority = "high";
      pump();
    },
    release: () => {
      if (unsubscribe() && current.subscribers === 0 && !current.started) drop(current);
    },
    abort: () => {
      unsubscribe();
      drop(current);
    },
  };
}
