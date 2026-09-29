import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import {
  fileExtension,
  formatFileSize,
  useUploadLimits,
  validateFiles,
} from "../../entities/attachment";
import { IconButton } from "../../shared/ui/icon-button";

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

interface PendingItem {
  file: File;
  previewUrl: string | null;
  rejectedReason: string | null;
}

function buildItems(files: File[]): PendingItem[] {
  return files.map((file) => ({
    file,
    previewUrl:
      file.type.startsWith("image/") || file.type.startsWith("video/")
        ? URL.createObjectURL(file)
        : null,
    rejectedReason: null,
  }));
}

interface AttachPreviewDialogProps {
  files: File[];
  onClose: () => void;
  /** Every accepted file becomes its own message (F4/T-032: no album
   * grouping) — `caption` is attached to the first one only. */
  onSend: (files: File[], caption: string) => void;
}

/**
 * Shown after picking/dropping/pasting one or more files, before any
 * upload starts (T-032 §4.4) — lets the user see what they're about to
 * send, drop individual files, and attach one caption before committing.
 */
export function AttachPreviewDialog({ files, onClose, onSend }: AttachPreviewDialogProps) {
  const { data: limits } = useUploadLimits();
  const [items, setItems] = useState<PendingItem[]>(() => buildItems(files));
  const [caption, setCaption] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      for (const item of items) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only, revoking on every `items` change would break the still-visible previews
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const rejections = useMemo(() => {
    if (!limits) return new Map<File, string>();
    const { rejected } = validateFiles(
      items.map((i) => i.file),
      limits,
    );
    return new Map(rejected.map((r) => [r.file, r.reason]));
  }, [items, limits]);

  const acceptedFiles = items.map((i) => i.file).filter((file) => !rejections.has(file));

  const removeItem = (file: File): void => {
    setItems((prev) => {
      const target = prev.find((i) => i.file === file);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.file !== file);
    });
  };

  const send = (): void => {
    if (acceptedFiles.length === 0) return;
    onSend(acceptedFiles, caption.trim());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Enter" && !event.shiftKey) {
      const target = event.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;
      event.preventDefault();
      send();
    }
  };

  if (items.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Предпросмотр вложений"
      tabIndex={-1}
      ref={dialogRef}
      onKeyDown={onKeyDown}
      className="absolute inset-x-0 top-17 bottom-0 z-20 flex animate-dialog-in flex-col bg-bg/95 backdrop-blur-[8px] outline-none"
    >
      <div className="flex h-14 flex-none items-center justify-between border-b border-line px-4">
        <span className="text-[14.5px] font-medium">
          {`Отправить (${acceptedFiles.length.toFixed(0)})`}
        </span>
        <IconButton icon={<CloseIcon />} label="Отмена" onClick={onClose} />
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-3 gap-3 overflow-y-auto p-4">
        {items.map((item) => {
          const reason = rejections.get(item.file);
          return (
            <div
              key={`${item.file.name}-${item.file.size.toFixed(0)}-${item.file.lastModified.toFixed(0)}`}
              className={[
                "relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-xl border",
                reason ? "border-danger/50 opacity-50" : "border-line",
              ].join(" ")}
            >
              {item.previewUrl && item.file.type.startsWith("image/") && (
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="h-full w-full object-cover"
                />
              )}
              {item.previewUrl && item.file.type.startsWith("video/") && (
                // `#t=0.1` + `preload="metadata"`: without a seek target the
                // browser never paints a frame for an unplayed <video>, so
                // the preview stays a black box.
                <video
                  src={`${item.previewUrl}#t=0.1`}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
              )}
              {!item.previewUrl && (
                <div className="flex flex-col items-center gap-1.5 px-2 text-center">
                  <span className="rounded-lg bg-bg2 px-2 py-1 font-mono text-[11px] font-medium">
                    {fileExtension(item.file.name, item.file.type)}
                  </span>
                  <span className="w-full truncate text-[11px] text-mute">{item.file.name}</span>
                </div>
              )}
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {formatFileSize(item.file.size)}
              </span>
              {reason && (
                <span className="absolute inset-x-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-center font-mono text-[10px] text-danger">
                  {reason}
                </span>
              )}
              <button
                type="button"
                aria-label={`Убрать ${item.file.name}`}
                onClick={() => {
                  removeItem(item.file);
                }}
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <CloseIcon />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-none items-center gap-2 border-t border-line px-4 py-3">
        <textarea
          value={caption}
          onChange={(e) => {
            setCaption(e.target.value);
          }}
          placeholder="Подпись"
          rows={1}
          className="h-11 max-h-24 min-w-0 flex-1 resize-none rounded-[23px] border border-line bg-bg2 px-4 py-2.5 text-[15px] text-fg outline-none focus-visible:border-accent-text"
        />
        <button
          type="button"
          onClick={send}
          disabled={acceptedFiles.length === 0}
          className="h-11 flex-none rounded-full [background:var(--color-accent)] px-5 text-[15px] font-semibold text-ink disabled:opacity-40"
        >
          {`Отправить (${acceptedFiles.length.toFixed(0)})`}
        </button>
      </div>
    </div>
  );
}
