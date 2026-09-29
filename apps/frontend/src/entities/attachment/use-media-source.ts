import type { Attachment } from "@ghostline/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { getCachedMedia } from "./media-cache";
import { isAbortError, requestMedia, type MediaPriority, type MediaRequest } from "./media-loader";

/** "checking" — looking in the cache (render an empty plate, no button yet). */
export type MediaSourceStatus = "checking" | "idle" | "loading" | "ready" | "error";

interface Phase {
  id: string | undefined;
  status: MediaSourceStatus;
  src?: string;
  loaded: number;
  total: number;
}

export interface UseMediaSourceOptions {
  /** Start downloading on its own once the element is (nearly) on screen. */
  autoDownload: boolean;
  /** Priority for the auto-download — "high" for a fresh message or the
   * fullscreen viewer, "low" for history. */
  priority?: MediaPriority;
  /** false — treat as always visible (the viewer); no `ref` needed. */
  observe?: boolean;
}

export interface MediaSource {
  status: MediaSourceStatus;
  /** A `blob:` URL once ready. */
  src: string | undefined;
  loaded: number;
  total: number;
  start: () => void;
  cancel: () => void;
  /** Attach to the bubble's root — gates auto-download on visibility. */
  ref: (element: Element | null) => void;
}

const VIEWPORT_MARGIN = "300px";

/**
 * A bubble's media bytes (docs/adr/0013): cache first, otherwise downloads
 * through the bounded `media-loader` queue — automatically when
 * `autoDownload` and on screen, or on `start()` (the "↓" button).
 */
export function useMediaSource(
  attachment: Attachment | null | undefined,
  { autoDownload, priority = "low", observe = true }: UseMediaSourceOptions,
): MediaSource {
  const id = attachment?.id;
  const [phase, setPhase] = useState<Phase>({
    id: undefined,
    status: "checking",
    loaded: 0,
    total: 0,
  });
  const [target, setTarget] = useState<Element | null>(null);
  const [inView, setInView] = useState(
    () => !observe || typeof IntersectionObserver === "undefined",
  );
  const requestRef = useRef<MediaRequest | null>(null);
  const activeIdRef = useRef<string | undefined>(undefined);

  const current: Phase =
    phase.id === id ? phase : { id, status: "checking", loaded: 0, total: attachment?.size ?? 0 };

  // Cache lookup whenever the attachment changes; releases any pending request.
  useEffect(() => {
    if (!id) return;
    activeIdRef.current = id;
    void getCachedMedia(id).then((blob) => {
      if (activeIdRef.current !== id) return;
      // No download can start while "checking" (auto-download and the
      // button both wait for "idle"), so this can't clobber one.
      setPhase(
        blob
          ? { id, status: "ready", src: URL.createObjectURL(blob), loaded: 0, total: blob.size }
          : { id, status: "idle", loaded: 0, total: 0 },
      );
    });
    return () => {
      activeIdRef.current = undefined;
      requestRef.current?.release();
      requestRef.current = null;
    };
  }, [id]);

  // Revoke each blob URL once it's replaced or the bubble unmounts.
  const src = current.src;
  useEffect(() => {
    if (!src) return;
    return () => {
      URL.revokeObjectURL(src);
    };
  }, [src]);

  useEffect(() => {
    if (!observe || !target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setInView(entry.isIntersecting);
      },
      { rootMargin: VIEWPORT_MARGIN },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [observe, target]);

  const load = useCallback(
    (loadPriority: MediaPriority) => {
      if (!attachment) return;
      if (requestRef.current) {
        if (loadPriority === "high") requestRef.current.prioritize();
        return;
      }
      const loadId = attachment.id;
      const request = requestMedia(attachment, loadPriority, (loaded, total) => {
        setPhase((prev) =>
          prev.id === loadId ? { ...prev, status: "loading", loaded, total } : prev,
        );
      });
      requestRef.current = request;
      setPhase({ id: loadId, status: "loading", loaded: 0, total: attachment.size });
      request.promise.then(
        (blob) => {
          if (requestRef.current === request) requestRef.current = null;
          if (activeIdRef.current !== loadId) return;
          setPhase({
            id: loadId,
            status: "ready",
            src: URL.createObjectURL(blob),
            loaded: blob.size,
            total: blob.size,
          });
        },
        (error: unknown) => {
          if (requestRef.current === request) requestRef.current = null;
          if (activeIdRef.current !== loadId) return;
          setPhase({
            id: loadId,
            status: isAbortError(error) ? "idle" : "error",
            loaded: 0,
            total: 0,
          });
        },
      );
    },
    [attachment],
  );

  const status = current.status;
  useEffect(() => {
    if (status !== "idle" || !autoDownload || !inView) return;
    // Deferred a tick so the state update isn't synchronous inside the effect.
    const timer = window.setTimeout(() => {
      load(priority);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [status, autoDownload, inView, priority, load]);

  // Scrolled away before a queued auto-download started — give up the slot.
  useEffect(() => {
    if (!inView && status === "loading" && priority === "low") {
      requestRef.current?.release();
    }
  }, [inView, status, priority]);

  const start = useCallback(() => {
    load("high");
  }, [load]);
  const cancel = useCallback(() => {
    requestRef.current?.abort();
  }, []);

  return {
    status,
    src,
    loaded: current.loaded,
    total: current.total || (attachment?.size ?? 0),
    start,
    cancel,
    ref: setTarget,
  };
}
