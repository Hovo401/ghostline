import { useEffect, useRef, useState } from "react";

import { fileExtension, formatFileSize } from "../../entities/attachment";
import { formatDuration, formatMessageMeta, type ChatMessage } from "../../entities/message";
import { Scramble } from "../../shared/ui/scramble";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  isLastOutgoing: boolean;
  /** Cascade delay in ms for the decrypt-in effect on the most recent
   * messages (DESIGN-BRIEF.md §5, 70ms step) — 0 skips straight to instant. */
  scrambleDelay: number;
  onRetry: (message: ChatMessage) => void;
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ marginLeft: 2 }} aria-hidden>
      <path d="M3 1.5v11l9.5-5.5z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="2.5" y="1.5" width="3.2" height="11" rx="1" fill="currentColor" />
      <rect x="8.3" y="1.5" width="3.2" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}

/** DESIGN-BRIEF.md §7.2: 300px 4:3 card, real photo, optional caption. */
function ImageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const attachment = message.attachment;
  return (
    <div
      className={[
        "w-[300px] max-w-[82%] overflow-hidden rounded-bubble",
        isOwn ? "[background:var(--color-accent)] text-ink" : "border border-line bg-in text-fg",
      ].join(" ")}
    >
      <div className="aspect-[4/3] bg-bg2">
        {attachment && (
          <img
            src={attachment.url}
            alt={attachment.name ?? "Фото"}
            className="block h-full w-full object-cover"
          />
        )}
      </div>
      {message.text && (
        <div className="px-3.5 py-2.5 text-msg leading-[1.45] break-words">{message.text}</div>
      )}
    </div>
  );
}

/** DESIGN-BRIEF.md §7.2: 280px chip, 42×50 extension "leaf", name + size. */
function FileBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const attachment = message.attachment;
  return (
    <div
      className={[
        "flex w-[280px] max-w-[82%] items-center gap-3 rounded-bubble py-2.5 pr-4 pl-2.5",
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
    </div>
  );
}

/** DESIGN-BRIEF.md §7.2: 270px pill, play button, 28-bar waveform, duration. */
function VoiceBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const attachment = message.attachment;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const durationMs = message.durationMs ?? 0;
  const bars = message.waveform && message.waveform.length > 0 ? message.waveform : DEFAULT_BARS;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = (): void => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    };
    const onPlay = (): void => {
      setPlaying(true);
    };
    const onPause = (): void => {
      setPlaying(false);
    };
    const onEnded = (): void => {
      setPlaying(false);
      setProgress(0);
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = (): void => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const displayMs = progress > 0 ? progress * durationMs : durationMs;

  return (
    <div
      className={[
        "flex w-[270px] max-w-[82%] items-center gap-2.5 rounded-bubble py-2 pr-3.5 pl-2",
        isOwn ? "[background:var(--color-accent)] text-ink" : "border border-line bg-in text-fg",
      ].join(" ")}
    >
      {attachment && <audio ref={audioRef} src={attachment.url} preload="metadata" />}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Пауза" : "Воспроизвести"}
        className={[
          "flex h-9.5 w-9.5 flex-none items-center justify-center rounded-full outline-none",
          isOwn ? "bg-ink text-accent" : "bg-accent text-ink",
        ].join(" ")}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="flex h-7.5 flex-1 items-center gap-0.5">
        {bars.map((level, index) => {
          const heightPct = Math.max(15, Math.round((level / 255) * 100));
          const played = bars.length > 0 && index / bars.length < progress;
          return (
            <span
              key={index}
              style={{ height: `${heightPct.toFixed(0)}%` }}
              className={[
                "min-w-0.5 flex-1 rounded-full bg-current",
                played ? "opacity-100" : playing ? "opacity-35" : "opacity-55",
              ].join(" ")}
            />
          );
        })}
      </div>
      <span className="flex-none font-mono text-[11.5px] opacity-80">
        {formatDuration(displayMs)}
      </span>
    </div>
  );
}

/** DESIGN-BRIEF.md §7.2: 210px circle, accent conic progress ring, center play. */
function VideoNoteBubble({ message }: { message: ChatMessage }) {
  const attachment = message.attachment;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const durationMs = message.durationMs ?? 0;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = (): void => {
      if (video.duration) setProgress(video.currentTime / video.duration);
    };
    const onPlay = (): void => {
      setPlaying(true);
    };
    const onPause = (): void => {
      setPlaying(false);
    };
    const onEnded = (): void => {
      setPlaying(false);
      setProgress(0);
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = (): void => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const displayMs = progress > 0 ? progress * durationMs : durationMs;
  const pct = Math.round(progress * 100);
  // Conic-gradient ring masked down to just its outer edge (prototype's
  // recipe) — the mask's `#000` marks full-alpha, it isn't a theme color.
  const ringMask =
    "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))";

  return (
    <button
      type="button"
      onClick={togglePlay}
      aria-label={playing ? "Пауза" : "Воспроизвести"}
      className="relative h-[210px] w-[210px] flex-none overflow-hidden rounded-full border border-line bg-bg2"
    >
      {attachment && (
        <video
          ref={videoRef}
          src={attachment.url}
          playsInline
          className="h-full w-full object-cover"
        />
      )}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(var(--color-accent) ${pct.toFixed(0)}%, transparent 0)`,
          WebkitMask: ringMask,
          mask: ringMask,
        }}
      />
      <span
        aria-hidden
        className="absolute top-1/2 left-1/2 flex h-13 w-13 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </span>
      <span
        aria-hidden
        className="absolute bottom-4.5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[11px] text-white"
      >
        {formatDuration(displayMs)}
      </span>
    </button>
  );
}

// Flat fallback wave for a voice message that arrived without real
// waveform samples (foreign/legacy data) — every message this app sends
// itself always carries the real one from the recorder.
const DEFAULT_BARS = Array.from({ length: 28 }, () => 140);

/** One message bubble + its status line — DESIGN-BRIEF.md §7.2. Renders
 * text plus the four media types (image/file/voice/video note); media
 * always carries the already-uploaded `attachment` (F4). */
export function MessageBubble({
  message,
  isOwn,
  isLastOutgoing,
  scrambleDelay,
  onRetry,
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
      {message.type === "image" && <ImageBubble message={message} isOwn={isOwn} />}
      {message.type === "file" && <FileBubble message={message} isOwn={isOwn} />}
      {message.type === "voice" && <VoiceBubble message={message} isOwn={isOwn} />}
      {message.type === "video" && <VideoNoteBubble message={message} />}
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
