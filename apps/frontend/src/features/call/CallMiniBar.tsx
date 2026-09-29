import { useCallStore } from "../../entities/call";
import { formatDuration } from "../../entities/message";
import { Avatar } from "../../shared/ui/avatar";

import { useCallPeer } from "./use-call-peer";
import { useElapsedMs } from "./use-call-timer";

/**
 * Persistent minimized-call bar (calls plan §Фаза 3) — shown whenever
 * `call-store.minimized` is true for a call this device is connecting/
 * active/reconnecting on, so a call can keep running while the user goes
 * back to messaging. Tapping it restores `CallScreen`.
 */
export function CallMiniBar() {
  const phase = useCallStore((state) => state.phase);
  const call = useCallStore((state) => state.call);
  const minimized = useCallStore((state) => state.minimized);
  const restore = useCallStore((state) => state.restore);
  const peer = useCallPeer(call?.chatId ?? null, call);
  const elapsedMs = useElapsedMs(phase === "active" ? (call?.answeredAt ?? null) : null);

  const visible =
    minimized &&
    call !== null &&
    (phase === "connecting" || phase === "active" || phase === "reconnecting");
  if (!visible) return null;

  const statusLabel =
    phase === "active"
      ? formatDuration(elapsedMs)
      : phase === "reconnecting"
        ? "Переподключение…"
        : "Соединение…";

  return (
    <button
      type="button"
      onClick={restore}
      aria-label="Развернуть звонок"
      className="flex w-full shrink-0 items-center gap-3 border-b border-line bg-bg2 px-4 py-1.5 text-left"
    >
      <Avatar name={peer?.displayName ?? "Абонент"} src={peer?.avatarUrl} size={24} />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate text-sm font-medium">{peer?.displayName ?? "Абонент"}</span>
        <span className="shrink-0 font-mono text-xs text-mute">{statusLabel}</span>
      </span>
      <span aria-hidden className="font-mono text-xs text-accent-text">
        {call.video ? "Видео" : "Аудио"}
      </span>
    </button>
  );
}
