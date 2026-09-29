import type { Attachment, AttachmentKind, MessageType } from "@ghostline/contracts";
import { create } from "zustand";

import { apiFetch } from "../../shared/api/http-client";

import { isCacheableMedia, putCachedMedia } from "./media-cache";
import { uploadAttachment } from "./upload-attachment";

export type UploadStatus = "uploading" | "finalizing" | "failed";

export interface UploadQueueEntry {
  clientMessageId: string;
  chatId: string;
  file: File;
  /** Storage class for `POST /attachments/presign` — "video" for both a
   * picked video and a recorded video note, they only differ in the
   * *message* type (`messageType` below). */
  kind: AttachmentKind;
  messageType: Exclude<MessageType, "text">;
  caption?: string;
  durationMs?: number;
  waveform?: number[];
  /** `URL.createObjectURL(file)` — the bubble's local preview until the
   * real `attachment.url` is ready; revoked once the entry leaves the
   * queue (`cancel`/internal settle). */
  previewUrl: string;
  status: UploadStatus;
  loaded: number;
  total: number;
  error?: unknown;
  attachmentId?: string;
}

export interface EnqueueParams {
  clientMessageId: string;
  chatId: string;
  file: File;
  kind: AttachmentKind;
  messageType: Exclude<MessageType, "text">;
  caption?: string;
  durationMs?: number;
  waveform?: number[];
  /** Fired once the attachment has finished uploading and `/complete`
   * confirmed it — the caller (features/chat's upload runner) sends the
   * actual message off the resulting `Attachment`. Awaited before the entry
   * is removed, so the bubble's local preview stays put until the real
   * message (with its own `attachment`) has actually landed in the message
   * cache instead of flashing empty in between. */
  onDone: (attachment: Attachment) => void | Promise<void>;
  /** Fired when the user cancels — the caller drops its optimistic bubble
   * (a permanent upload failure instead stays visible via the entry's
   * `status`/`error` so the bubble can offer "Повторить"). */
  onCancelled?: () => void;
}

interface Runner {
  abort: AbortController;
  doneParts: Set<number>;
  onDone: (attachment: Attachment) => void | Promise<void>;
  onCancelled?: () => void;
}

// Non-reactive bookkeeping (abort controllers, multipart resume state,
// completion callbacks) kept outside Zustand state — none of it needs to
// trigger a re-render itself, only the plain `entries` record does.
const runners = new Map<string, Runner>();

interface UploadQueueState {
  entries: Record<string, UploadQueueEntry>;
  enqueue: (params: EnqueueParams) => void;
  cancel: (clientMessageId: string) => void;
  retry: (clientMessageId: string) => void;
}

function removeEntry(
  set: (fn: (state: UploadQueueState) => Partial<UploadQueueState>) => void,
  clientMessageId: string,
): void {
  runners.delete(clientMessageId);
  set((state) => {
    const { [clientMessageId]: _removed, ...rest } = state.entries;
    return { entries: rest };
  });
}

async function runUpload(clientMessageId: string): Promise<void> {
  const runner = runners.get(clientMessageId);
  const entry = useUploadQueueStore.getState().entries[clientMessageId];
  if (!runner || !entry) return;

  try {
    const attachment = await uploadAttachment({
      file: entry.file,
      fileName: entry.file.name,
      kind: entry.kind,
      signal: runner.abort.signal,
      doneParts: runner.doneParts,
      onPartDone: (partNumber) => {
        runner.doneParts.add(partNumber);
      },
      onAttachmentId: (attachmentId) => {
        useUploadQueueStore.setState((state) => {
          const current = state.entries[clientMessageId];
          if (!current) return state;
          return { entries: { ...state.entries, [clientMessageId]: { ...current, attachmentId } } };
        });
      },
      onProgress: (loaded, total) => {
        useUploadQueueStore.setState((state) => {
          const current = state.entries[clientMessageId];
          if (!current) return state;
          return {
            entries: {
              ...state.entries,
              [clientMessageId]: {
                ...current,
                loaded,
                total,
                status: loaded >= total ? "finalizing" : "uploading",
              },
            },
          };
        });
      },
    });

    // The sender already has the bytes — cache them so their own media
    // never downloads again (docs/adr/0013).
    if (isCacheableMedia(attachment.mime, entry.file.size)) {
      await putCachedMedia(attachment.id, entry.file);
    }

    // The upload succeeded — hand off to the caller (sends the actual
    // message), wait for that to land in the message cache, then drop the
    // queue entry; from here on the message's own pending/failed state
    // carries the bubble.
    const stillRunner = runners.get(clientMessageId);
    await stillRunner?.onDone(attachment);
    removeEntry(useUploadQueueStore.setState, clientMessageId);
  } catch (error) {
    if ((error as { code?: string } | undefined)?.code === "aborted") return; // cancel() already cleaned up
    useUploadQueueStore.setState((state) => {
      const current = state.entries[clientMessageId];
      if (!current) return state;
      return {
        entries: { ...state.entries, [clientMessageId]: { ...current, status: "failed", error } },
      };
    });
  }
}

/**
 * Upload queue (T-032 §4.2) — module-level Zustand store, so an in-flight
 * upload survives navigating away from the chat it belongs to. One entry
 * per in-flight/failed upload keyed by `clientMessageId`, the same id the
 * optimistic message bubble (`entities/message`) uses — `MessageBubble`'s
 * `UploadOverlay` reads progress/status from here instead of duplicating it
 * onto the message object (apps/frontend/CLAUDE.md: don't keep a second
 * copy of state another layer already owns).
 *
 * Doesn't itself call `POST /messages` — that needs `useSendMessage`'s
 * mutation, and `entities/attachment` can't import `entities/message`
 * (sibling-entity imports aren't allowed, see `shared/api/query-keys.ts`).
 * `features/chat`'s upload runner bridges the two: it enqueues here with an
 * `onDone` that calls `sendMedia`, and an `onCancelled` that removes the
 * bubble from the message cache.
 */
export const useUploadQueueStore = create<UploadQueueState>((set, get) => ({
  entries: {},

  enqueue: (params) => {
    const {
      clientMessageId,
      chatId,
      file,
      kind,
      messageType,
      caption,
      durationMs,
      waveform,
      onDone,
      onCancelled,
    } = params;
    const previewUrl = URL.createObjectURL(file);
    runners.set(clientMessageId, {
      abort: new AbortController(),
      doneParts: new Set(),
      onDone,
      onCancelled,
    });

    set((state) => ({
      entries: {
        ...state.entries,
        [clientMessageId]: {
          clientMessageId,
          chatId,
          file,
          kind,
          messageType,
          caption,
          durationMs,
          waveform,
          previewUrl,
          status: "uploading",
          loaded: 0,
          total: file.size,
        },
      },
    }));

    void runUpload(clientMessageId);
  },

  cancel: (clientMessageId) => {
    const runner = runners.get(clientMessageId);
    const entry = get().entries[clientMessageId];
    runner?.abort.abort();
    if (entry?.attachmentId) {
      void apiFetch(`/attachments/${entry.attachmentId}`, { method: "DELETE" }).catch(() => {
        // Best-effort — an orphaned PENDING row/object is cleaned up by the
        // backend's stale-upload sweep (BACKLOG.md), not fatal here.
      });
    }
    if (entry) URL.revokeObjectURL(entry.previewUrl);
    runner?.onCancelled?.();
    removeEntry(set, clientMessageId);
  },

  retry: (clientMessageId) => {
    const entry = get().entries[clientMessageId];
    const runner = runners.get(clientMessageId);
    if (!entry || !runner) return;
    runners.set(clientMessageId, { ...runner, abort: new AbortController() });
    set((state) => ({
      entries: {
        ...state.entries,
        [clientMessageId]: { ...entry, status: "uploading", error: undefined },
      },
    }));
    void runUpload(clientMessageId);
  },
}));

/** `routes/app.tsx`'s `useBeforeUnload` gate and the "Загружается N файлов"
 * status line both need this — a plain selector rather than a hook so it
 * can also be read outside a component if needed. */
export function selectHasActiveUploads(state: UploadQueueState): boolean {
  return Object.values(state.entries).some(
    (entry) => entry.status === "uploading" || entry.status === "finalizing",
  );
}

export function selectActiveUploadCount(state: UploadQueueState): number {
  return Object.values(state.entries).filter(
    (entry) => entry.status === "uploading" || entry.status === "finalizing",
  ).length;
}
