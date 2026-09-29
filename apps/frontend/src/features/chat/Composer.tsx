import type { AttachmentKind, MessageType } from "@ghostline/contracts";
import { useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import { readVideoDurationMs, useUploadQueueStore, withTimeout } from "../../entities/attachment";
import { useEmitTyping } from "../../entities/chat";
import {
  formatDuration,
  removeMessage,
  sendMediaAttachment,
  useSendMessage,
} from "../../entities/message";
import { Backdrop } from "../../shared/ui/backdrop";
import { IconButton } from "../../shared/ui/icon-button";
import { ProgressRing } from "../../shared/ui/progress-ring";

import { AttachPreviewDialog } from "./AttachPreviewDialog";
import { useChatUiStore } from "./chat-ui-store";
import { VIDEO_NOTE_MAX_MS } from "./recorder-store";
import { useRecorder } from "./use-recorder";

const DIMENSION_TIMEOUT_MS = 5000;

function AttachIcon() {
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
    >
      <path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9" />
    </svg>
  );
}

function PhotoIcon() {
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
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </svg>
  );
}

function FileIcon() {
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
    >
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function MicIcon() {
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
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </svg>
  );
}

function VideoIcon() {
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
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

/** Storage class + message type for a picked/dropped/pasted file — "video"
 * covers both here since a *picked* video is `type: "video"` (a normal
 * player bubble), only a *recorded* video note is `type: "video_note"`. */
function classifyFile(file: File): {
  kind: AttachmentKind;
  messageType: Exclude<MessageType, "text">;
} {
  if (file.type.startsWith("image/")) return { kind: "image", messageType: "image" };
  if (file.type.startsWith("video/")) return { kind: "video", messageType: "video" };
  return { kind: "file", messageType: "file" };
}

/**
 * Message input — DESIGN-BRIEF.md §7.2: "пилюля" text field, circular send
 * button once there's a draft; the paperclip opens a photo/file menu,
 * otherwise mic/camera start a voice/video-note recording (F4). Media goes
 * through `upload-queue-store` (T-032): the optimistic bubble appears the
 * instant a file is picked, the upload itself runs independently of this
 * component's lifecycle so it survives switching chats.
 */
export function Composer({ chatId }: { chatId: string }) {
  const draft = useChatUiStore((state) => state.drafts[chatId] ?? "");
  const setDraft = useChatUiStore((state) => state.setDraft);
  const pendingFiles = useChatUiStore((state) => state.pendingAttachFiles[chatId]);
  const openAttachDialog = useChatUiStore((state) => state.openAttachDialog);
  const closeAttachDialog = useChatUiStore((state) => state.closeAttachDialog);
  const { send, beginMedia } = useSendMessage(chatId);
  const emitTyping = useEmitTyping(chatId);
  const enqueue = useUploadQueueStore((state) => state.enqueue);
  const queryClient = useQueryClient();
  const recorder = useRecorder();

  const [attachOpen, setAttachOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoPreviewRef.current;
    if (!video) return;
    video.srcObject = recorder.previewStream;
  }, [recorder.previewStream]);

  const submit = (): void => {
    if (!draft.trim()) return;
    send(draft);
    setDraft(chatId, "");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const startRecording = async (kind: "voice" | "video"): Promise<void> => {
    try {
      await recorder.start(kind);
    } catch {
      // No microphone/camera or permission denied — no-op, same as
      // dismissing the recorder without ever starting it.
    }
  };

  const enqueueMedia = (params: {
    file: File;
    kind: AttachmentKind;
    messageType: Exclude<MessageType, "text">;
    caption?: string;
    durationMs?: number;
    waveform?: number[];
  }): void => {
    const clientMessageId = crypto.randomUUID();
    const { file, kind, messageType, caption, durationMs, waveform } = params;
    beginMedia({ clientMessageId, type: messageType, caption, durationMs, waveform });
    enqueue({
      clientMessageId,
      chatId,
      file,
      kind,
      messageType,
      caption,
      durationMs,
      waveform,
      onDone: async (attachment) => {
        await sendMediaAttachment(queryClient, {
          chatId,
          clientMessageId,
          type: messageType,
          attachment,
          durationMs,
          waveform,
          caption,
        });
      },
      onCancelled: () => {
        removeMessage(queryClient, chatId, clientMessageId);
      },
    });
  };

  const sendPickedFiles = (files: File[], caption: string): void => {
    files.forEach((file, index) => {
      const { kind, messageType } = classifyFile(file);
      const thisCaption = index === 0 && caption ? caption : undefined;
      if (messageType === "video") {
        void withTimeout(readVideoDurationMs(file), DIMENSION_TIMEOUT_MS).then((durationMs) => {
          enqueueMedia({
            file,
            kind,
            messageType,
            caption: thisCaption,
            durationMs: durationMs ?? undefined,
          });
        });
      } else {
        enqueueMedia({ file, kind, messageType, caption: thisCaption });
      }
    });
    closeAttachDialog(chatId);
  };

  const onPhotoOrVideoSelected = (e: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setAttachOpen(false);
    if (files.length === 0) return;
    openAttachDialog(chatId, files);
  };

  const onFileSelected = (e: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setAttachOpen(false);
    if (files.length === 0) return;
    openAttachDialog(chatId, files);
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = Array.from(e.clipboardData.files);
    if (files.length === 0) return;
    e.preventDefault();
    openAttachDialog(chatId, files);
  };

  const onDragEnter = (e: DragEvent<HTMLDivElement>): void => {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounter.current += 1;
    setDragActive(true);
  };
  const onDragLeave = (): void => {
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>): void => {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  };
  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    openAttachDialog(chatId, files);
  };

  const finishRecording = async (): Promise<void> => {
    const recorded = await recorder.finish();
    if (!recorded) return;
    const file = new File([recorded.blob], `${recorded.kind}.webm`, { type: recorded.mime });
    const kind: AttachmentKind = recorded.kind === "voice" ? "voice" : "video";
    const messageType: Exclude<MessageType, "text"> =
      recorded.kind === "voice" ? "voice" : "video_note";
    enqueueMedia({
      file,
      kind,
      messageType,
      durationMs: recorded.durationMs,
      waveform: recorded.waveform,
    });
  };

  const hasDraft = draft.trim().length > 0;
  const recordingVoice = recorder.kind === "voice";
  const recordingVideo = recorder.kind === "video";

  return (
    <>
      {pendingFiles && pendingFiles.length > 0 && (
        <AttachPreviewDialog
          files={pendingFiles}
          onClose={() => {
            closeAttachDialog(chatId);
          }}
          onSend={sendPickedFiles}
        />
      )}

      {recordingVideo && (
        <div className="absolute inset-x-0 top-17 bottom-0 z-10 flex flex-col items-center justify-center gap-5.5 bg-bg/88 backdrop-blur-[8px]">
          <div className="relative flex h-65 w-65 items-center justify-center overflow-hidden rounded-full border border-line bg-bg2">
            <video
              ref={videoPreviewRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            <ProgressRing
              percent={(recorder.elapsedMs / VIDEO_NOTE_MAX_MS) * 100}
              size={260}
              strokeWidth={4}
              colorClassName="text-danger"
              className="absolute inset-0"
            />
          </div>
          <div className="flex items-center gap-2.5 font-mono text-sm">
            <span className="h-2.5 w-2.5 animate-rec-blink rounded-full bg-danger" />
            {formatDuration(recorder.elapsedMs)} / {formatDuration(VIDEO_NOTE_MAX_MS)}
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={recorder.cancel}
              className="h-11.5 rounded-xl border border-line bg-bg px-5 text-[15px]"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => {
                void finishRecording();
              }}
              className="h-11.5 rounded-xl [background:var(--color-accent)] px-5.5 text-[15px] font-semibold text-ink"
            >
              Отправить
            </button>
          </div>
        </div>
      )}

      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="relative flex items-center gap-2 border-t border-line bg-bg px-4 pt-3 pb-4"
      >
        {dragActive && (
          <div
            aria-hidden
            className="absolute inset-x-0 top-17 bottom-0 z-10 flex items-center justify-center border-2 border-dashed border-accent-text bg-bg/90 text-[15px] font-medium text-accent-text"
          >
            Отпустите, чтобы отправить
          </div>
        )}
        <Backdrop
          open={attachOpen}
          onClose={() => {
            setAttachOpen(false);
          }}
        />
        {attachOpen && (
          <div className="absolute bottom-18 left-4 z-50 flex w-57.5 flex-col rounded-2xl border border-line bg-panel p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.3)]">
            <button
              type="button"
              onClick={() => {
                photoInputRef.current?.click();
              }}
              className="flex h-11 items-center gap-3 rounded-lg px-3 text-left text-[14.5px] hover:bg-bg2"
            >
              <PhotoIcon />
              Фото или видео
            </button>
            <button
              type="button"
              onClick={() => {
                fileInputRef.current?.click();
              }}
              className="flex h-11 items-center gap-3 rounded-lg px-3 text-left text-[14.5px] hover:bg-bg2"
            >
              <FileIcon />
              Файл
            </button>
          </div>
        )}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={onPhotoOrVideoSelected}
        />
        <input ref={fileInputRef} type="file" multiple hidden onChange={onFileSelected} />

        {recordingVoice ? (
          <>
            <button
              type="button"
              onClick={recorder.cancel}
              className="h-11 flex-none rounded-full border border-line px-3.5 text-sm text-mute"
            >
              Отмена
            </button>
            <div className="flex h-11.5 min-w-0 flex-1 items-center gap-3 rounded-[23px] border border-line bg-bg2 px-4">
              <span className="h-2.5 w-2.5 flex-none animate-rec-blink rounded-full bg-danger" />
              <span className="flex-none font-mono text-[13px]">
                {formatDuration(recorder.elapsedMs)}
              </span>
              <div className="flex h-6.5 min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-accent-text">
                {recorder.levels.map((level, index) => (
                  <span
                    key={index}
                    style={{
                      height: `${Math.max(15, Math.round((level / 255) * 100)).toFixed(0)}%`,
                    }}
                    className="min-w-0.5 flex-1 rounded-full bg-current"
                  />
                ))}
              </div>
            </div>
            <IconButton
              icon={<span aria-hidden>{"↑"}</span>}
              label="Отправить"
              variant="accent"
              onClick={() => {
                void finishRecording();
              }}
            />
          </>
        ) : (
          <>
            <IconButton
              icon={<AttachIcon />}
              label="Прикрепить"
              onClick={() => {
                setAttachOpen((open) => !open);
              }}
              className={attachOpen ? "bg-bg2" : undefined}
            />
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(chatId, e.target.value);
                emitTyping();
              }}
              onKeyDown={handleKeyDown}
              onPaste={onPaste}
              placeholder="Сообщение"
              rows={1}
              className="h-11.5 max-h-32 min-w-0 flex-1 resize-none rounded-[23px] border border-line bg-bg2 px-4 py-2.5 text-[15px] text-fg outline-none focus-visible:border-accent-text"
            />
            {hasDraft ? (
              <IconButton
                icon={<span aria-hidden>{"↑"}</span>}
                label="Отправить"
                variant="accent"
                onClick={submit}
              />
            ) : (
              <>
                <IconButton
                  icon={<MicIcon />}
                  label="Голосовое сообщение"
                  onClick={() => {
                    void startRecording("voice");
                  }}
                />
                <IconButton
                  icon={<VideoIcon />}
                  label="Видеосообщение"
                  onClick={() => {
                    void startRecording("video");
                  }}
                />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
