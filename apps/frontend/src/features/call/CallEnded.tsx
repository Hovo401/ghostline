import { useEffect } from "react";

import { playBusy, useCallStore, type CallEndReason } from "../../entities/call";
import { formatDuration } from "../../entities/message";
import { Avatar } from "../../shared/ui/avatar";

import { useCallPeer } from "./use-call-peer";

/** How long the summary screen stays up before `reset()` returns the call
 * store to idle — long enough to read, short enough not to feel stuck. */
const AUTO_DISMISS_MS = 1800;

function reasonCopy(reason: CallEndReason, durationLabel: string | null): string {
  switch (reason) {
    case "ended":
      return durationLabel ? `Звонок завершён · ${durationLabel}` : "Звонок завершён";
    case "cancelled":
      return "Звонок отменён";
    case "declined":
      return "Звонок отклонён";
    case "busy":
      return "Абонент занят";
    case "missed":
      return "Пропущенный звонок";
    case "rate_limited":
      return "Слишком много попыток, подождите";
    case "connect_failed":
      return "Не удалось установить соединение";
    case "failed":
    case "unavailable":
    case "forbidden":
      return "Не удалось позвонить";
  }
}

/**
 * Transient post-call summary (calls plan) — shown for `phase === "ended"`,
 * auto-dismisses back to `"idle"` after `AUTO_DISMISS_MS` so the next call
 * (incoming or outgoing) isn't blocked behind it. Copy varies by
 * `call-store`'s `endReason`; duration (only for a call that was actually
 * answered) comes from `formatDuration` (`entities/message`) rather than a
 * second mm:ss formatter.
 */
export function CallEnded() {
  const phase = useCallStore((state) => state.phase);
  const call = useCallStore((state) => state.call);
  const draft = useCallStore((state) => state.draft);
  const endReason = useCallStore((state) => state.endReason);
  const reset = useCallStore((state) => state.reset);
  const chatId = call?.chatId ?? draft?.chatId ?? null;
  const peer = useCallPeer(chatId, call);

  useEffect(() => {
    if (phase !== "ended") return;
    const timer = setTimeout(reset, AUTO_DISMISS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [phase, reset]);

  useEffect(() => {
    if (phase !== "ended" || endReason !== "busy") return;
    const stop = playBusy();
    return stop;
  }, [phase, endReason]);

  if (phase !== "ended" || !endReason) return null;

  const durationLabel =
    endReason === "ended" && call?.answeredAt
      ? formatDuration(Date.now() - new Date(call.answeredAt).getTime())
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Звонок завершён"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-6 sm:items-center"
    >
      <div className="flex w-full max-w-90 flex-col items-center gap-4 rounded-3xl border border-line bg-bg2 p-7 text-center shadow-glow">
        <Avatar name={peer?.displayName ?? "Абонент"} src={peer?.avatarUrl} size={72} />
        <div className="flex flex-col gap-1">
          <span className="text-base font-medium">{peer?.displayName ?? "Абонент"}</span>
          <span className="font-mono text-xs text-mute">
            {reasonCopy(endReason, durationLabel)}
          </span>
        </div>
      </div>
    </div>
  );
}
