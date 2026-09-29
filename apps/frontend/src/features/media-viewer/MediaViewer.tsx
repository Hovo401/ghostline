import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { downloadAttachment, useMediaSource, useMediaViewerStore } from "../../entities/attachment";
import { formatDuration } from "../../entities/message";
import { IconButton } from "../../shared/ui/icon-button";
import { RoundVideo } from "../../shared/ui/round-video";

import { fetchTextPreview, TEXT_PREVIEW_MAX_BYTES } from "./text-preview";
import { useZoomPan } from "./use-zoom-pan";

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 4l-8 8 8 8" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 4l8 8-8 8" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  );
}

/** `FileBubble`'s "Просмотр" mode (T-032 §4.5) — fetches up to 1 MiB of the
 * attachment as plain text and shows it in a monospace `<pre>`. No markdown
 * rendering (deliberately — plain text is safe and doesn't need a new
 * dependency, per apps/frontend/CLAUDE.md's "no speculative abstraction"). */
function TextPreview({ url }: { url: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; text: string; truncated: boolean }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchTextPreview(url)
      .then((result) => {
        if (!cancelled) setState({ status: "ready", ...result });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.status === "loading") {
    return <div className="flex flex-1 items-center justify-center text-white/70">Загрузка…</div>;
  }
  if (state.status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center text-white/70">
        Не удалось загрузить файл
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
      <pre className="mx-auto w-full max-w-3xl whitespace-pre-wrap break-words rounded-xl bg-black/40 p-4 font-mono text-[13px] text-white">
        {state.text}
      </pre>
      {state.truncated && (
        <span className="mx-auto mt-2 font-mono text-xs text-white/60">
          {`Показаны первые ${(TEXT_PREVIEW_MAX_BYTES / (1024 * 1024)).toFixed(0)} МБ`}
        </span>
      )}
    </div>
  );
}

/**
 * Fullscreen media viewer (T-033, FR-MEDIA-09) — mounted once in the route
 * layout (`routes/app.tsx`) and driven entirely by
 * `entities/attachment`'s `useMediaViewerStore`; renders nothing while
 * closed. Two modes: an image/video gallery (←/→, pinch/wheel zoom for
 * images) or a single attachment's plain-text preview (T-032 §4.5).
 * `createPortal`ed to `document.body` so it sits above the whole app
 * regardless of where `open()`/`openText()` was called from.
 */
export function MediaViewer() {
  const mode = useMediaViewerStore((state) => state.mode);
  const items = useMediaViewerStore((state) => state.items);
  const index = useMediaViewerStore((state) => state.index);
  const textAttachment = useMediaViewerStore((state) => state.textAttachment);
  const close = useMediaViewerStore((state) => state.close);
  const next = useMediaViewerStore((state) => state.next);
  const prev = useMediaViewerStore((state) => state.prev);
  const round = useMediaViewerStore((state) => state.round);

  const attachment = mode === "gallery" && index !== null ? (items[index] ?? null) : null;
  const isVideo = attachment?.mime.startsWith("video/") ?? false;
  const isOpen =
    mode === "gallery" ? attachment !== null : mode === "text" && textAttachment !== null;
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // A copy the chat already cached opens instantly and offline; otherwise
  // the plain URL — the browser renders/streams it progressively.
  const cached = useMediaSource(attachment, { autoDownload: false, observe: false });
  const mediaSrc =
    cached.status === "checking" ? undefined : (cached.src ?? attachment?.url ?? undefined);
  const { scale, x, y, reset, handlers } = useZoomPan({ onSwipeLeft: next, onSwipeRight: prev });

  useEffect(() => {
    reset();
  }, [attachment?.id, reset]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
      else if (mode === "gallery" && event.key === "ArrowLeft") prev();
      else if (mode === "gallery" && event.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, mode, close, prev, next]);

  // Pause playback when paging away from a video item instead of letting it
  // keep playing off-screen/muted underneath the next item.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      video?.pause();
    };
  }, [attachment?.id]);

  if (!isOpen) return null;

  const current = mode === "text" ? textAttachment : attachment;
  if (!current) return null;

  const filename = current.name ?? `file-${current.id}`;
  const label = mode === "text" ? "Просмотр файла" : "Просмотр изображения";

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 outline-none"
    >
      <div className="relative z-10 flex h-16 flex-none items-center justify-between px-4">
        <span className="font-mono text-sm text-white/80">
          {mode === "gallery" && index !== null
            ? `${(index + 1).toString()} / ${items.length.toString()}`
            : filename}
        </span>
        <div className="flex items-center gap-1.5">
          <IconButton
            icon={<DownloadIcon />}
            label="Скачать"
            variant="inverse"
            onClick={() => {
              void downloadAttachment(current);
            }}
          />
          <IconButton icon={<CloseIcon />} label="Закрыть" variant="inverse" onClick={close} />
        </div>
      </div>

      {mode === "gallery" && items.length > 1 && index !== null && index > 0 && (
        <IconButton
          icon={<ChevronLeftIcon />}
          label="Предыдущее фото"
          variant="inverse"
          onClick={prev}
          className="absolute top-1/2 left-2 z-20 -translate-y-1/2"
        />
      )}
      {mode === "gallery" && items.length > 1 && index !== null && index < items.length - 1 && (
        <IconButton
          icon={<ChevronRightIcon />}
          label="Следующее фото"
          variant="inverse"
          onClick={next}
          className="absolute top-1/2 right-2 z-20 -translate-y-1/2"
        />
      )}

      {mode === "text" ? (
        <TextPreview url={current.url} />
      ) : (
        <div
          data-testid="media-viewer-backdrop"
          className="relative z-10 flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden"
          onClick={close}
          {...(isVideo ? {} : handlers)}
        >
          {isVideo && round ? (
            <div
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <RoundVideo
                key={current.id}
                src={mediaSrc}
                size={Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.8)}
                formatTime={formatDuration}
                autoPlay
              />
            </div>
          ) : isVideo ? (
            <video
              ref={videoRef}
              key={current.id}
              src={mediaSrc}
              controls
              autoPlay
              playsInline
              onClick={(event) => {
                event.stopPropagation();
              }}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <img
              src={mediaSrc}
              alt={current.name ?? "Фото"}
              draggable={false}
              onClick={(event) => {
                event.stopPropagation();
              }}
              className={[
                "max-h-full max-w-full touch-none object-contain select-none",
                scale > 1 ? "cursor-grab" : "cursor-zoom-in",
              ].join(" ")}
              style={{
                transform: `translate(${x.toString()}px, ${y.toString()}px) scale(${scale.toString()})`,
              }}
            />
          )}
        </div>
      )}

      {/* TODO(T-033b): "Перейти к сообщению" needs `messageId` on
       * `Attachment` (contract + `/chats/:id/media` + a feed scroll-to
       * action) — deliberately out of T-033's scope, see BACKLOG.md. */}
    </div>,
    document.body,
  );
}
