import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { useMediaViewerStore } from "../../entities/attachment";
import { IconButton } from "../../shared/ui/icon-button";

import { downloadAttachment } from "./download-attachment";
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

/**
 * Fullscreen media viewer (T-033, FR-MEDIA-09) — mounted once in the route
 * layout (`routes/app.tsx`) and driven entirely by
 * `entities/attachment`'s `useMediaViewerStore`; renders nothing while
 * closed. `createPortal`ed to `document.body` so it sits above the whole
 * app regardless of where `open()` was called from.
 */
export function MediaViewer() {
  const items = useMediaViewerStore((state) => state.items);
  const index = useMediaViewerStore((state) => state.index);
  const close = useMediaViewerStore((state) => state.close);
  const next = useMediaViewerStore((state) => state.next);
  const prev = useMediaViewerStore((state) => state.prev);

  const attachment = index === null ? null : (items[index] ?? null);
  const isOpen = attachment !== null;
  const dialogRef = useRef<HTMLDivElement>(null);
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
      else if (event.key === "ArrowLeft") prev();
      else if (event.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, close, prev, next]);

  if (!attachment || index === null) return null;

  const filename = attachment.name ?? `image-${attachment.id}`;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр изображения"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 outline-none"
    >
      <div className="relative z-10 flex h-16 flex-none items-center justify-between px-4">
        <span className="font-mono text-sm text-white/80">
          {`${(index + 1).toString()} / ${items.length.toString()}`}
        </span>
        <div className="flex items-center gap-1.5">
          <IconButton
            icon={<DownloadIcon />}
            label="Скачать"
            variant="inverse"
            onClick={() => {
              void downloadAttachment(attachment.url, filename);
            }}
          />
          <IconButton icon={<CloseIcon />} label="Закрыть" variant="inverse" onClick={close} />
        </div>
      </div>

      {items.length > 1 && index > 0 && (
        <IconButton
          icon={<ChevronLeftIcon />}
          label="Предыдущее фото"
          variant="inverse"
          onClick={prev}
          className="absolute top-1/2 left-2 z-10 -translate-y-1/2"
        />
      )}
      {items.length > 1 && index < items.length - 1 && (
        <IconButton
          icon={<ChevronRightIcon />}
          label="Следующее фото"
          variant="inverse"
          onClick={next}
          className="absolute top-1/2 right-2 z-10 -translate-y-1/2"
        />
      )}

      <div
        data-testid="media-viewer-backdrop"
        className="relative z-10 flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden"
        onClick={close}
        {...handlers}
      >
        <img
          src={attachment.url}
          alt={attachment.name ?? "Фото"}
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
      </div>

      {/* TODO(T-033b): "Перейти к сообщению" needs `messageId` on
       * `Attachment` (contract + `/chats/:id/media` + a feed scroll-to
       * action) — deliberately out of T-033's scope, see BACKLOG.md. */}
    </div>,
    document.body,
  );
}
