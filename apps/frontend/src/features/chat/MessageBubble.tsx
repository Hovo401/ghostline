import {
  describeUploadError,
  downloadAttachment,
  fileExtension,
  formatFileSize,
  isTextPreviewable,
  shouldAutoDownload,
  useAudioPlayerStore,
  useMediaSource,
  useMediaViewerStore,
  useUploadQueueStore,
  type MediaSource,
} from "../../entities/attachment";
import {
  formatDuration,
  formatMessageMeta,
  useFreshMessageStore,
  type ChatMessage,
} from "../../entities/message";
import { useSeekPointer } from "../../shared/lib/use-seek-pointer";
import { PhoneIcon, VideoCameraIcon } from "../../shared/ui/call-icons";
import { PauseIcon, PlayIcon } from "../../shared/ui/media-icons";
import { MediaBackdrop, MediaPlaceholder } from "../../shared/ui/media-placeholder";
import { ProgressRing } from "../../shared/ui/progress-ring";
import { RoundVideo } from "../../shared/ui/round-video";
import { Scramble } from "../../shared/ui/scramble";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  isLastOutgoing: boolean;
  /** Cascade delay in ms for the decrypt-in effect on the most recent
   * messages (DESIGN-BRIEF.md §5, 70ms step) — 0 skips straight to instant. */
  scrambleDelay: number;
  onRetry: (message: ChatMessage) => void;
  /** Opens the fullscreen media viewer (T-033) at this message's photo/video
   * — only meaningful for `type === "image" | "video"`, ignored otherwise. */
  onOpenImage?: (messageId: string) => void;
  /** Starts a new call back into this chat, in the same mode (audio/video)
   * — only meaningful for `type === "call"`, ignored otherwise. */
  onCallBack?: (message: ChatMessage) => void;
  /** Starts/toggles this voice message in the shared player (or jumps to
   * `startFraction` of it) — only meaningful for `type === "voice"`. */
  onPlayVoice?: (message: ChatMessage, startFraction?: number) => void;
}

function DownloadIcon() {
  return (
    <svg
      width="15"
      height="15"
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

function EyeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * Overlay for a bubble whose media is still uploading/failed — reads
 * progress from `upload-queue-store` by `clientMessageId` rather than
 * duplicating it onto the message object (apps/frontend/CLAUDE.md: one copy
 * of state per layer). Renders nothing once the entry has left the queue
 * (upload finished — the real `attachment` takes over the bubble). Own
 * messages only ever have a queue entry, so this is a no-op for incoming
 * messages/history.
 */
function UploadOverlay({ clientMessageId }: { clientMessageId: string }) {
  const entry = useUploadQueueStore((state) => state.entries[clientMessageId]);
  const cancel = useUploadQueueStore((state) => state.cancel);
  const retry = useUploadQueueStore((state) => state.retry);
  if (!entry) return null;

  if (entry.status === "failed") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-bubble bg-black/70 p-3 text-center text-white">
        <span className="text-[12.5px] leading-snug">{describeUploadError(entry.error)}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              retry(clientMessageId);
            }}
            className="rounded-full [background:var(--color-accent)] px-3 py-1 text-[12px] font-semibold text-ink"
          >
            Повторить
          </button>
          <button
            type="button"
            onClick={() => {
              cancel(clientMessageId);
            }}
            className="rounded-full border border-white/40 px-3 py-1 text-[12px] text-white"
          >
            Удалить
          </button>
        </div>
      </div>
    );
  }

  const percent = entry.total > 0 ? (entry.loaded / entry.total) * 100 : 0;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-bubble bg-black/45">
      <ProgressRing percent={percent} size={46} strokeWidth={3} colorClassName="text-white" />
      <span className="font-mono text-[11px] text-white">
        {`${formatFileSize(entry.loaded)} / ${formatFileSize(entry.total)}`}
      </span>
      <button
        type="button"
        aria-label="Отменить загрузку"
        onClick={() => {
          cancel(clientMessageId);
        }}
        className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
      >
        {"✕"}
      </button>
    </div>
  );
}

/** Cache → auto-download policy → `useMediaSource` for one media bubble
 * (docs/adr/0013). A message that just arrived over the socket loads first. */
function useBubbleMedia(message: ChatMessage): MediaSource {
  const attachment = message.attachment;
  const isFresh = useFreshMessageStore((state) => state.ids[message.id] === true);
  return useMediaSource(attachment, {
    autoDownload: !!attachment && shouldAutoDownload(message.type, attachment, isFresh),
    priority: isFresh ? "high" : "low",
  });
}

function placeholderProps(media: MediaSource) {
  return {
    status: media.status === "ready" ? ("checking" as const) : media.status,
    percent: media.total > 0 ? (media.loaded / media.total) * 100 : 0,
    label:
      media.status === "loading"
        ? `${formatFileSize(media.loaded)} / ${formatFileSize(media.total)}`
        : formatFileSize(media.total),
    onStart: media.start,
    onCancel: media.cancel,
  };
}

/** DESIGN-BRIEF.md §7.2: 300px 4:3 card, real photo, optional caption.
 * Clickable — opens the fullscreen viewer (T-033) on the feed's gallery at
 * this message's photo. Shows the local `previewUrl` from the upload queue
 * while pending, swaps to the real `attachment.url` once it lands. */
function ImageBubble({
  message,
  isOwn,
  onOpenImage,
}: {
  message: ChatMessage;
  isOwn: boolean;
  onOpenImage?: (messageId: string) => void;
}) {
  const attachment = message.attachment;
  const queueEntry = useUploadQueueStore((state) => state.entries[message.clientMessageId]);
  const media = useBubbleMedia(message);
  const src = media.src ?? queueEntry?.previewUrl;
  return (
    <div
      ref={media.ref}
      className={[
        "relative w-[300px] max-w-[82%] overflow-hidden rounded-bubble",
        isOwn ? "[background:var(--color-accent)] text-ink" : "border border-line bg-in text-fg",
      ].join(" ")}
    >
      <div className="relative aspect-[4/3] bg-bg2">
        {!src && attachment && <MediaPlaceholder {...placeholderProps(media)} />}
        {src && (
          <button
            type="button"
            onClick={() => {
              if (attachment) onOpenImage?.(message.id);
            }}
            aria-label="Открыть фото"
            className={[
              "block h-full w-full",
              attachment ? "cursor-zoom-in" : "cursor-default",
            ].join(" ")}
          >
            <img
              src={src}
              alt={attachment?.name ?? "Фото"}
              decoding="async"
              className="block h-full w-full object-cover"
            />
          </button>
        )}
      </div>
      {message.text && (
        <div className="px-3.5 py-2.5 text-msg leading-[1.45] break-words">{message.text}</div>
      )}
      <UploadOverlay clientMessageId={message.clientMessageId} />
    </div>
  );
}

/** DESIGN-BRIEF.md §7.2 style, T-032 §4.4: normal rectangular video with a
 * poster frame, a play affordance and a duration badge — a *picked* video
 * (`type: "video"`), as opposed to the round `video_note` recorder bubble. */
function VideoBubble({
  message,
  isOwn,
  onOpenImage,
}: {
  message: ChatMessage;
  isOwn: boolean;
  onOpenImage?: (messageId: string) => void;
}) {
  const attachment = message.attachment;
  const queueEntry = useUploadQueueStore((state) => state.entries[message.clientMessageId]);
  // Never auto-downloaded: only a local/cached copy gets a poster frame,
  // otherwise a plate — the viewer streams it on tap (docs/adr/0013).
  const media = useMediaSource(attachment, { autoDownload: false, observe: false });
  const src = media.src ?? queueEntry?.previewUrl;
  const durationMs = message.durationMs ?? 0;
  const badge = [
    durationMs > 0 ? formatDuration(durationMs) : null,
    !src && attachment ? formatFileSize(attachment.size) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={[
        "relative w-[300px] max-w-[82%] overflow-hidden rounded-bubble",
        isOwn ? "[background:var(--color-accent)] text-ink" : "border border-line bg-in text-fg",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => {
          if (attachment) onOpenImage?.(message.id);
        }}
        aria-label="Открыть видео"
        className={[
          "group relative block aspect-[4/3] w-full overflow-hidden bg-bg2",
          attachment ? "cursor-pointer" : "cursor-default",
        ].join(" ")}
      >
        {src && (
          // `#t=0.1`: seek past frame 0 so the browser paints a poster frame
          // (some browsers leave an unplayed <video> black otherwise).
          <video
            src={`${src}#t=0.1`}
            preload="metadata"
            playsInline
            muted
            className="block h-full w-full object-cover"
          />
        )}
        {!src && attachment && (
          <>
            <MediaBackdrop icon="video" />
            <span
              aria-hidden
              className="absolute top-2.5 left-2.5 rounded-md bg-black/55 px-2 py-0.5 font-mono text-[10.5px] font-medium tracking-wide text-white backdrop-blur-sm"
            >
              {fileExtension(attachment.name, attachment.mime)}
            </span>
          </>
        )}
        {attachment && (
          <span
            aria-hidden
            className={[
              "absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform group-hover:scale-105 [&>svg]:h-5 [&>svg]:w-5",
              src ? "h-12 w-12 bg-black/55 text-white" : "h-14 w-14 bg-accent text-ink shadow-glow",
            ].join(" ")}
          >
            <PlayIcon />
          </span>
        )}
        {badge && (
          <span
            aria-hidden
            className="absolute right-2.5 bottom-2.5 rounded-full bg-black/55 px-2.5 py-0.5 font-mono text-[11px] text-white backdrop-blur-sm"
          >
            {badge}
          </span>
        )}
      </button>
      {message.text && (
        <div className="px-3.5 py-2.5 text-msg leading-[1.45] break-words">{message.text}</div>
      )}
      <UploadOverlay clientMessageId={message.clientMessageId} />
    </div>
  );
}

/** DESIGN-BRIEF.md §7.2: 280px chip, 42×50 extension "leaf", name + size,
 * plus "Скачать" (every file type) and "Просмотр" for small text formats
 * (T-032 §4.4) and for images/videos sent as a file (opens the media viewer). */
function FileBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const attachment = message.attachment;
  const openText = useMediaViewerStore((state) => state.openText);
  const openMedia = useMediaViewerStore((state) => state.open);
  const textPreviewable = attachment ? isTextPreviewable(attachment.mime, attachment.name) : false;
  const mediaPreviewable =
    !!attachment && (attachment.mime.startsWith("image/") || attachment.mime.startsWith("video/"));

  return (
    <div
      className={[
        "relative flex w-[280px] max-w-[82%] items-center gap-3 rounded-bubble py-2.5 pr-3 pl-2.5",
        isOwn ? "[background:var(--color-accent)] text-ink" : "border border-line bg-in text-fg",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-12.5 w-10.5 flex-none flex-col items-center justify-end rounded-lg pb-1.5 font-mono text-[10.5px] font-medium",
          isOwn ? "bg-ink/15" : "bg-bg2",
        ].join(" ")}
      >
        {fileExtension(attachment?.name ?? null, attachment?.mime ?? "")}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14.5px] font-medium">{attachment?.name ?? "Файл"}</span>
        <span className="font-mono text-[11.5px] opacity-75">
          {formatFileSize(attachment?.size ?? 0)}
        </span>
      </div>
      {attachment && (
        <div className="flex flex-none items-center gap-1">
          {(textPreviewable || mediaPreviewable) && (
            <button
              type="button"
              aria-label="Просмотр"
              onClick={() => {
                if (mediaPreviewable) openMedia([attachment], 0);
                else openText(attachment);
              }}
              className={[
                "flex h-8 w-8 items-center justify-center rounded-full",
                isOwn ? "hover:bg-ink/15" : "hover:bg-bg2",
              ].join(" ")}
            >
              <EyeIcon />
            </button>
          )}
          <button
            type="button"
            aria-label="Скачать"
            onClick={() => {
              void downloadAttachment(attachment);
            }}
            className={[
              "flex h-8 w-8 items-center justify-center rounded-full",
              isOwn ? "hover:bg-ink/15" : "hover:bg-bg2",
            ].join(" ")}
          >
            <DownloadIcon />
          </button>
        </div>
      )}
      <UploadOverlay clientMessageId={message.clientMessageId} />
    </div>
  );
}

/** DESIGN-BRIEF.md §7.2: 270px pill, play button, 28-bar waveform, duration,
 * plus a small download affordance (T-032 §4.4). Playback goes through the
 * app-wide `audio-player-store` (one voice message at a time, mirrored in
 * the chat's top bar); the waveform doubles as a click/drag seek slider. */
function VoiceBubble({
  message,
  isOwn,
  onPlayVoice,
}: {
  message: ChatMessage;
  isOwn: boolean;
  onPlayVoice?: (message: ChatMessage, startFraction?: number) => void;
}) {
  const attachment = message.attachment;
  // Keeps the bubble's download/auto-download behaviour — the player reads
  // the bytes back from the same cache.
  const media = useBubbleMedia(message);
  const isCurrent = useAudioPlayerStore((state) => state.track?.messageId === message.id);
  const playing = useAudioPlayerStore(
    (state) => state.track?.messageId === message.id && state.playing,
  );
  const progress = useAudioPlayerStore((state) =>
    state.track?.messageId === message.id && state.durationMs > 0
      ? Math.min(1, state.positionMs / state.durationMs)
      : 0,
  );
  const seekBy = useAudioPlayerStore((state) => state.seekBy);
  const durationMs = message.durationMs ?? 0;
  const bars = message.waveform && message.waveform.length > 0 ? message.waveform : DEFAULT_BARS;
  const canPlay = !!attachment && !!onPlayVoice;
  const seekPointer = useSeekPointer((fraction) => {
    if (canPlay) onPlayVoice(message, fraction);
  });

  const displayMs = isCurrent ? progress * durationMs : durationMs;

  return (
    <div
      ref={media.ref}
      className={[
        "relative flex w-[270px] max-w-[82%] items-center gap-2.5 rounded-bubble py-2 pr-3 pl-2",
        isOwn ? "[background:var(--color-accent)] text-ink" : "border border-line bg-in text-fg",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => {
          if (canPlay) onPlayVoice(message);
        }}
        aria-label={playing ? "Пауза" : "Воспроизвести"}
        className={[
          "flex h-9.5 w-9.5 flex-none items-center justify-center rounded-full outline-none",
          isOwn ? "bg-ink text-accent-text" : "bg-accent text-ink",
        ].join(" ")}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div
        role="slider"
        tabIndex={canPlay ? 0 : -1}
        aria-label="Перемотка"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(displayMs / 1000)}
        aria-valuetext={formatDuration(isCurrent ? displayMs : 0)}
        {...(canPlay ? seekPointer : {})}
        onKeyDown={(event) => {
          if (!isCurrent) return;
          if (event.key === "ArrowRight") seekBy(SEEK_STEP_MS);
          else if (event.key === "ArrowLeft") seekBy(-SEEK_STEP_MS);
          else return;
          event.preventDefault();
        }}
        className={[
          "flex h-7.5 flex-1 touch-none items-center gap-0.5 outline-none",
          canPlay ? "cursor-pointer" : "",
        ].join(" ")}
      >
        {bars.map((level, index) => {
          const heightPct = Math.max(15, Math.round((level / 255) * 100));
          const played = isCurrent && index / bars.length < progress;
          return (
            <span
              key={index}
              style={{ height: `${heightPct.toFixed(0)}%` }}
              className={[
                "pointer-events-none min-w-0.5 flex-1 rounded-full bg-current",
                played ? "opacity-100" : isCurrent ? "opacity-35" : "opacity-55",
              ].join(" ")}
            />
          );
        })}
      </div>
      <span className="flex-none font-mono text-[11.5px] opacity-80">
        {formatDuration(displayMs)}
      </span>
      {attachment && (
        <button
          type="button"
          aria-label="Скачать"
          onClick={() => {
            void downloadAttachment(attachment);
          }}
          className={[
            "flex h-7 w-7 flex-none items-center justify-center rounded-full",
            isOwn ? "hover:bg-ink/15" : "hover:bg-bg2",
          ].join(" ")}
        >
          <DownloadIcon />
        </button>
      )}
      <UploadOverlay clientMessageId={message.clientMessageId} />
    </div>
  );
}

/** ←/→ on a focused waveform — same step as Telegram's. */
const SEEK_STEP_MS = 5_000;

/** DESIGN-BRIEF.md §7.2: 210px circle, accent conic progress ring, center
 * play — the recorder's round video note (`type: "video_note"`), distinct
 * from a picked/gallery `VideoBubble` (`type: "video"`). */
function VideoNoteBubble({ message }: { message: ChatMessage }) {
  const attachment = message.attachment;
  const queueEntry = useUploadQueueStore((state) => state.entries[message.clientMessageId]);
  const openViewer = useMediaViewerStore((state) => state.open);
  const media = useBubbleMedia(message);
  const localSrc = media.src ?? queueEntry?.previewUrl;

  return (
    <div ref={media.ref} className="flex items-start gap-2">
      <RoundVideo
        src={localSrc ?? attachment?.url}
        preload={localSrc ? "metadata" : "none"}
        size={210}
        durationMs={message.durationMs ?? undefined}
        formatTime={formatDuration}
      >
        <UploadOverlay clientMessageId={message.clientMessageId} />
      </RoundVideo>
      {attachment && (
        <button
          type="button"
          onClick={() => {
            openViewer([attachment], 0, { round: true });
          }}
          aria-label="Увеличить"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-line bg-bg2 text-mute hover:text-fg"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}

// Flat fallback wave for a voice message that arrived without real
// waveform samples (foreign/legacy data) — every message this app sends
// itself always carries the real one from the recorder.
const DEFAULT_BARS = Array.from({ length: 28 }, () => 140);

const CALL_STATUS_LABEL: Record<"missed" | "declined" | "cancelled", string> = {
  missed: "Пропущенный",
  declined: "Отклонённый",
  cancelled: "Отменённый",
};

/** History row for a `type: "call"` message (calls plan) — phrased from
 * `message.call.status`/`video`/`durationMs` and whether the current user
 * placed the call ("Исходящий видеозвонок · 5:23") or received it
 * ("Пропущенный аудиозвонок"). Tapping it starts a new call into the same
 * chat, in the same mode. */
function CallBubble({
  message,
  isOwn,
  onCallBack,
}: {
  message: ChatMessage;
  isOwn: boolean;
  onCallBack?: (message: ChatMessage) => void;
}) {
  const call = message.call;
  if (!call) return null;

  const kindLabel = call.video ? "видеозвонок" : "аудиозвонок";
  const statusPrefix = call.status === "ended" ? null : CALL_STATUS_LABEL[call.status];
  const label = statusPrefix
    ? `${statusPrefix} ${kindLabel}`
    : `${isOwn ? "Исходящий" : "Входящий"} ${kindLabel}${
        call.durationMs != null ? ` · ${formatDuration(call.durationMs)}` : ""
      }`;

  return (
    <button
      type="button"
      onClick={() => {
        onCallBack?.(message);
      }}
      className={[
        "flex w-fit max-w-[82%] items-center gap-2.5 rounded-bubble px-3.5 py-2.5 text-msg",
        isOwn ? "[background:var(--color-accent)] text-ink" : "border border-line bg-in text-fg",
      ].join(" ")}
    >
      <span aria-hidden className="flex-none">
        {call.video ? <VideoCameraIcon /> : <PhoneIcon />}
      </span>
      <span>{label}</span>
    </button>
  );
}

/** One message bubble + its status line — DESIGN-BRIEF.md §7.2. Renders
 * text plus the media types (image/file/voice/video/video note); media
 * always carries the already-uploaded `attachment` once ready, or a local
 * preview from `upload-queue-store` while still uploading (F4, T-032). */
export function MessageBubble({
  message,
  isOwn,
  isLastOutgoing,
  scrambleDelay,
  onRetry,
  onOpenImage,
  onCallBack,
  onPlayVoice,
}: MessageBubbleProps) {
  const meta = formatMessageMeta(message, isOwn, isLastOutgoing);

  return (
    <div className={["flex flex-col gap-1", isOwn ? "items-end" : "items-start"].join(" ")}>
      {message.type === "text" && (
        <div
          className={[
            "max-w-[min(520px,82%)] rounded-bubble px-3.5 py-2.5 text-msg leading-[1.45] break-words",
            isOwn
              ? "[background:var(--color-accent)] text-ink shadow-glow"
              : "border border-line bg-in text-fg",
          ].join(" ")}
        >
          <Scramble text={message.text ?? ""} delay={scrambleDelay} instant={scrambleDelay === 0} />
        </div>
      )}
      {message.type === "image" && (
        <ImageBubble message={message} isOwn={isOwn} onOpenImage={onOpenImage} />
      )}
      {message.type === "video" && (
        <VideoBubble message={message} isOwn={isOwn} onOpenImage={onOpenImage} />
      )}
      {message.type === "file" && <FileBubble message={message} isOwn={isOwn} />}
      {message.type === "voice" && (
        <VoiceBubble message={message} isOwn={isOwn} onPlayVoice={onPlayVoice} />
      )}
      {message.type === "video_note" && <VideoNoteBubble message={message} />}
      {message.type === "call" && (
        <CallBubble message={message} isOwn={isOwn} onCallBack={onCallBack} />
      )}
      <span
        className={[
          "px-1.5 font-mono text-xs",
          meta.accent ? "text-accent-text" : "text-mute",
        ].join(" ")}
      >
        {meta.text}
      </span>
      {message.failed && (
        <button
          type="button"
          onClick={() => {
            onRetry(message);
          }}
          className="px-1.5 font-mono text-xs text-accent-text underline"
        >
          Повторить
        </button>
      )}
    </div>
  );
}
