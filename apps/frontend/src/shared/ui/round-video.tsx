import { useEffect, useRef, useState, type ReactNode } from "react";

import { PauseIcon, PlayIcon } from "./media-icons";
import { ProgressRing } from "./progress-ring";

export interface RoundVideoProps {
  src: string | undefined;
  /** Circle diameter in px. */
  size: number;
  /** Known duration; falls back to the video's own metadata. */
  durationMs?: number;
  formatTime: (ms: number) => string;
  autoPlay?: boolean;
  /** "none" in the chat feed for a remote src — otherwise the browser may
   * pull every video note in full just by rendering the feed. */
  preload?: "none" | "metadata" | "auto";
  /** Extra overlay inside the circle (e.g. an upload progress overlay). */
  children?: ReactNode;
}

/** Round video note player (DESIGN-BRIEF §7.2) — tap to play/pause, accent
 * progress ring, Telegram-style "▶ 0:05" pill; no native controls. Used by
 * the chat bubble and by the media viewer's enlarged round mode so both
 * behave identically. */
export function RoundVideo({
  src,
  size,
  durationMs,
  formatTime,
  autoPlay = false,
  preload = "metadata",
  children,
}: RoundVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [metaMs, setMetaMs] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = (): void => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setProgress(video.currentTime / video.duration);
      }
    };
    const onMeta = (): void => {
      if (Number.isFinite(video.duration)) setMetaMs(video.duration * 1000);
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
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    return () => {
      video.pause();
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const togglePlay = (): void => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const totalMs = durationMs ?? metaMs;
  const displayMs = progress > 0 ? progress * totalMs : totalMs;

  return (
    <button
      type="button"
      onClick={togglePlay}
      aria-label={playing ? "Пауза" : "Воспроизвести"}
      className="relative flex-none overflow-hidden rounded-full border border-line bg-bg2"
      style={{ width: size, height: size }}
    >
      {src && (
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload={preload}
          autoPlay={autoPlay}
          className={[
            "h-full w-full object-cover transition-opacity",
            playing ? "" : "opacity-80",
          ].join(" ")}
        />
      )}
      <ProgressRing
        percent={Math.round(progress * 100)}
        size={size}
        strokeWidth={4}
        className="absolute inset-0"
      />
      <span
        aria-hidden
        className="absolute bottom-[8%] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[11px] text-white"
      >
        <span className="flex [&>svg]:h-2.5 [&>svg]:w-2.5">
          {playing ? <PauseIcon /> : <PlayIcon />}
        </span>
        {formatTime(displayMs)}
      </span>
      {children}
    </button>
  );
}
