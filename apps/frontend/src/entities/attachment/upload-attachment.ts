import {
  AttachmentSchema,
  CompleteUploadRequestSchema,
  PresignPartsResponseSchema,
  PresignUploadResponseSchema,
  type Attachment,
  type AttachmentKind,
  type CompleteUploadRequest,
  type PresignUploadRequest,
} from "@ghostline/contracts";

import { apiFetch } from "../../shared/api/http-client";

import { readMediaDimensions } from "./read-media-dimensions";
import { isUploadError, putFileWithProgress, UploadError } from "./upload-file";

const DIMENSION_READ_TIMEOUT_MS = 5000;
const MAX_PARALLEL_PARTS = 3;
const MAX_PART_RETRIES = 3;
const PART_RETRY_BASE_DELAY_MS = 500;

/** Resolves `null` instead of hanging forever if a `<video>`/`<img>`
 * element's `loadedmetadata`/`load` never fires (a stuck decode shouldn't
 * block the whole upload) — used for both dimension and duration reads. */
export function withTimeout<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      resolve(null);
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

function noop(): void {
  // Default for `onPartDone` when the caller doesn't need per-part resume
  // bookkeeping (e.g. a direct `uploadAttachment` call in a test).
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isAborted(error: unknown): boolean {
  return isUploadError(error) && error.code === "aborted";
}

export interface UploadAttachmentParams {
  file: File | Blob;
  fileName: string;
  kind: AttachmentKind;
  /** Cumulative bytes uploaded / total size — multipart tracks this across
   * parts instead of a single-PUT fraction. */
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
  /** Part numbers (1-based) already confirmed uploaded by a previous
   * attempt — `upload-queue-store.ts`'s retry passes this so it resumes
   * instead of re-uploading the whole file. */
  doneParts?: Set<number>;
  /** Fired every time a part finishes uploading — the caller grows its own
   * `doneParts` set for a future retry off this. */
  onPartDone?: (partNumber: number) => void;
  /** Fired as soon as the presign response names the `attachmentId`, before
   * any bytes move — `upload-queue-store.ts` needs it early so a cancel
   * mid-upload can `DELETE /attachments/:id` even though this function
   * itself doesn't resolve until the upload (and `/complete`) is done. */
  onAttachmentId?: (attachmentId: string) => void;
}

interface PartRange {
  partNumber: number;
  start: number;
  end: number;
}

function partRange(partNumber: number, partSize: number, total: number): PartRange {
  const start = (partNumber - 1) * partSize;
  return { partNumber, start, end: Math.min(start + partSize, total) };
}

async function uploadOnePart(
  attachmentUrl: string,
  blob: Blob,
  mime: string,
  signal: AbortSignal | undefined,
  onProgress: (fraction: number) => void,
): Promise<void> {
  await putFileWithProgress(attachmentUrl, blob, mime, onProgress, signal);
}

async function uploadMultipart(
  attachmentId: string,
  file: Blob,
  mime: string,
  partSize: number,
  partCount: number,
  signal: AbortSignal | undefined,
  doneParts: Set<number>,
  onPartDone: (partNumber: number) => void,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const total = file.size;
  const allParts = Array.from({ length: partCount }, (_, i) => partRange(i + 1, partSize, total));

  let loaded = allParts
    .filter((p) => doneParts.has(p.partNumber))
    .reduce((sum, p) => sum + (p.end - p.start), 0);
  onProgress?.(loaded, total);

  const pending = allParts.filter((p) => !doneParts.has(p.partNumber));

  for (let i = 0; i < pending.length; i += MAX_PARALLEL_PARTS) {
    if (signal?.aborted) throw new UploadError("aborted");
    const batch = pending.slice(i, i + MAX_PARALLEL_PARTS);

    const presignData = await apiFetch(`/attachments/${attachmentId}/parts`, {
      method: "POST",
      body: { partNumbers: batch.map((p) => p.partNumber) },
    });
    const { parts } = PresignPartsResponseSchema.parse(presignData);
    const urlByPart = new Map(parts.map((p) => [p.partNumber, p.url]));

    await Promise.all(
      batch.map(async (part) => {
        const url = urlByPart.get(part.partNumber);
        if (!url) throw new Error(`no presigned URL for part ${part.partNumber.toFixed(0)}`);
        const blob = file.slice(part.start, part.end);

        let lastError: unknown;
        for (let attempt = 0; attempt < MAX_PART_RETRIES; attempt += 1) {
          if (signal?.aborted) throw new UploadError("aborted");
          let partLoaded = 0;
          try {
            await uploadOnePart(url, blob, mime, signal, (fraction) => {
              const nextPartLoaded = Math.round(fraction * blob.size);
              loaded += nextPartLoaded - partLoaded;
              partLoaded = nextPartLoaded;
              onProgress?.(loaded, total);
            });
            // The progress callback above isn't guaranteed to fire with a
            // final 100% before `onload` (and never fires at all in a test
            // double) — top the part off explicitly so cumulative progress
            // always reaches the part's full size on success.
            loaded += blob.size - partLoaded;
            doneParts.add(part.partNumber);
            onPartDone(part.partNumber);
            onProgress?.(loaded, total);
            return;
          } catch (error) {
            loaded -= partLoaded;
            onProgress?.(loaded, total);
            lastError = error;
            if (isAborted(error)) throw error;
            if (attempt < MAX_PART_RETRIES - 1) {
              await delay(PART_RETRY_BASE_DELAY_MS * 2 ** attempt);
            }
          }
        }
        throw lastError;
      }),
    );
  }
}

/**
 * Presign → upload → complete flow (REQUIREMENTS.md §7.6):
 * `POST /attachments/presign` returns either a single presigned PUT
 * (`mode: "single"`, files at or under `MULTIPART_THRESHOLD_BYTES`) or a
 * multipart upload (`mode: "multipart"`) that's sliced into
 * `partSize`-sized `Blob`s, presigned a few at a time via
 * `POST /attachments/:id/parts`, and uploaded up to 3 in parallel with a
 * retry-with-backoff per part. Either way, `POST /attachments/:id/complete`
 * confirms it landed and returns the full `Attachment` (presigned GET `url`
 * included) ready to hand to `useSendMessage`'s media send. Exported as a
 * plain async function so it's testable without going through React Query
 * or Zustand — `upload-queue-store.ts` is the stateful runner around it.
 */
export async function uploadAttachment(params: UploadAttachmentParams): Promise<Attachment> {
  const {
    file,
    fileName,
    kind,
    onProgress,
    signal,
    doneParts = new Set(),
    onPartDone,
    onAttachmentId,
  } = params;
  const mime = file.type || "application/octet-stream";

  const presignBody: PresignUploadRequest = { kind, mime, size: file.size, fileName };
  const presignData = await apiFetch("/attachments/presign", { method: "POST", body: presignBody });
  const presign = PresignUploadResponseSchema.parse(presignData);
  onAttachmentId?.(presign.attachmentId);

  if (presign.mode === "single") {
    await putFileWithProgress(
      presign.uploadUrl,
      file,
      mime,
      onProgress
        ? (fraction) => {
            onProgress(Math.round(fraction * file.size), file.size);
          }
        : undefined,
      signal,
    );
  } else {
    await uploadMultipart(
      presign.attachmentId,
      file,
      mime,
      presign.partSize,
      presign.partCount,
      signal,
      doneParts,
      onPartDone ?? noop,
      onProgress,
    );
  }

  const dimensions =
    kind === "image" || kind === "video"
      ? await withTimeout(readMediaDimensions(file, kind), DIMENSION_READ_TIMEOUT_MS)
      : null;
  const completeBody: CompleteUploadRequest = CompleteUploadRequestSchema.parse({
    attachmentId: presign.attachmentId,
    ...(dimensions ?? {}),
  });
  const completeData = await apiFetch(`/attachments/${presign.attachmentId}/complete`, {
    method: "POST",
    body: completeBody,
  });
  return AttachmentSchema.parse(completeData);
}
