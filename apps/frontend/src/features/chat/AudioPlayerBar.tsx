import type { ReactNode } from "react";

import { neighbourOf, useAudioPlayerStore } from "../../entities/attachment";
import { formatDuration } from "../../entities/message";
import { useSeekPointer } from "../../shared/lib/use-seek-pointer";
import { IconButton } from "../../shared/ui/icon-button";
import {
  CloseIcon,
  NextTrackIcon,
  PauseIcon,
  PlayIcon,
  PrevTrackIcon,
} from "../../shared/ui/media-icons";

import { formatTrackDate } from "./format";

function Accent({ children }: { children: ReactNode }) {
  return <span className="flex text-accent-text">{children}</span>;
}

/** Telegram-style "now playing" strip under the chat header — shown while
 * the shared voice player (`audio-player-store`) has a track, whichever
 * chat it came from. ⏮/⏭ walk that chat's voice messages; the thin line
 * along the bottom edge is a click/drag seek bar. */
export function AudioPlayerBar() {
  const track = useAudioPlayerStore((state) => state.track);
  const playing = useAudioPlayerStore((state) => state.playing);
  const positionMs = useAudioPlayerStore((state) => state.positionMs);
  const durationMs = useAudioPlayerStore((state) => state.durationMs);
  const rate = useAudioPlayerStore((state) => state.rate);
  const hasPrev = useAudioPlayerStore((state) => neighbourOf(state, -1) !== undefined);
  const hasNext = useAudioPlayerStore((state) => neighbourOf(state, 1) !== undefined);
  const { toggle, seek, prev, next, cycleRate, stop } = useAudioPlayerStore.getState();
  const seekPointer = useSeekPointer(seek);

  if (!track) return null;

  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <div className="relative flex h-12 flex-none items-center gap-1 border-b border-line bg-bg px-2">
      <IconButton
        icon={
          <Accent>
            <PrevTrackIcon />
          </Accent>
        }
        label="Предыдущее"
        disabled={!hasPrev}
        onClick={prev}
        className="disabled:opacity-40"
      />
      <IconButton
        icon={<Accent>{playing ? <PauseIcon /> : <PlayIcon />}</Accent>}
        label={playing ? "Пауза" : "Воспроизвести"}
        onClick={toggle}
      />
      <IconButton
        icon={
          <Accent>
            <NextTrackIcon />
          </Accent>
        }
        label="Следующее"
        disabled={!hasNext}
        onClick={next}
        className="disabled:opacity-40"
      />
      <span className="ml-1 min-w-0 flex-1 truncate text-[13.5px]">
        <span className="font-medium">{track.title}</span>{" "}
        <span className="text-mute">{formatTrackDate(track.createdAt)}</span>
      </span>
      <span className="flex-none px-1 font-mono text-[12px] text-mute">
        {formatDuration(positionMs)}
      </span>
      <button
        type="button"
        onClick={cycleRate}
        aria-label="Скорость воспроизведения"
        className={[
          "h-8 flex-none rounded-lg px-2 font-mono text-[12px]",
          rate === 1 ? "text-mute hover:text-fg" : "text-accent-text",
        ].join(" ")}
      >
        {`${String(rate)}x`}
      </button>
      <IconButton icon={<CloseIcon />} label="Закрыть плеер" onClick={stop} />
      <div
        role="slider"
        aria-label="Перемотка"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(positionMs / 1000)}
        {...seekPointer}
        className="absolute inset-x-0 -bottom-1.5 z-10 flex h-3 cursor-pointer touch-none items-center"
      >
        <div className="pointer-events-none h-0.5 w-full bg-line">
          <div
            className="h-full [background:var(--color-accent)]"
            style={{ width: `${(progress * 100).toFixed(2)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
