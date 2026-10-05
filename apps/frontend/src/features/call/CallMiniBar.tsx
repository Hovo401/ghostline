import { useCallStore } from "../../entities/call";
import { formatDuration } from "../../entities/message";
import { Avatar } from "../../shared/ui/avatar";

import { useCallPeer } from "./use-call-peer";
import { useElapsedMs } from "./use-call-timer";

/**
 * Persistent minimized-call bar (calls plan §Фаза 3) — shown whenever
 * `call-store.minimized` is true for a call this device is dialing/connecting/
 * active/reconnecting on, so a call can keep running while the user goes
 * back to messaging. Tapping it restores `CallScreen`.
 *
 * While this tab has no call of its own but the account's call runs on another device
 * (`elsewhereCall`, ADR-0023) the same slot holds a plain, non-interactive plate saying so.
 */
export function CallMiniBar() {
  const phase = useCallStore((state) => state.phase);
  const call = useCallStore((state) => state.call);
  const draft = useCallStore((state) => state.draft);
  const elsewhereCall = useCallStore((state) => state.elsewhereCall);
  const minimized = useCallStore((state) => state.minimized);
  const restore = useCallStore((state) => state.restore);
  const shownCall = call ?? elsewhereCall;
  const peer = useCallPeer(shownCall?.chatId ?? draft?.chatId ?? null, shownCall);
  const timerFrom =
    phase === "active"
      ? (call?.answeredAt ?? null)
      : phase === "idle" && elsewhereCall?.status === "active"
        ? elsewhereCall.answeredAt
        : null;
  const elapsedMs = useElapsedMs(timerFrom);
  const peerName = peer?.displayName ?? "Абонент";

  if (phase === "idle" && elsewhereCall) {
    return (
      <div
        role="status"
        className="flex w-full shrink-0 items-center gap-3 border-b border-line bg-bg2 px-4 py-1.5 text-left"
      >
        <Avatar name={peerName} src={peer?.avatarUrl} size={24} />
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm text-mute">
          <span className="truncate">Идёт звонок на другом устройстве · {peerName}</span>
          {elsewhereCall.status === "active" && (
            <span className="shrink-0 font-mono text-xs">{formatDuration(elapsedMs)}</span>
          )}
        </span>
      </div>
    );
  }

  const visible =
    minimized &&
    (phase === "outgoing" ||
      (call !== null &&
        (phase === "connecting" || phase === "active" || phase === "reconnecting")));
  if (!visible) return null;

  const statusLabel =
    phase === "active"
      ? formatDuration(elapsedMs)
      : phase === "reconnecting"
        ? "Переподключение…"
        : phase === "outgoing"
          ? "Вызов…"
          : "Соединение…";
  const video = call?.video ?? draft?.video ?? false;

  return (
    <button
      type="button"
      onClick={restore}
      aria-label="Развернуть звонок"
      className="flex w-full shrink-0 items-center gap-3 border-b border-line bg-bg2 px-4 py-1.5 text-left"
    >
      <Avatar name={peerName} src={peer?.avatarUrl} size={24} />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate text-sm font-medium">{peerName}</span>
        <span className="shrink-0 font-mono text-xs text-mute">{statusLabel}</span>
      </span>
      <span aria-hidden className="font-mono text-xs text-accent-text">
        {video ? "Видео" : "Аудио"}
      </span>
    </button>
  );
}
