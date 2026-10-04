import { useSessionStore } from "../../shared/api/session-store";
import { Dots } from "../../shared/ui/dots";

/**
 * Route `pendingComponent` for `/login` and `/app` while `ensureSession`
 * resolves (T-091). Dots only on a normal boot; once the bootstrap is
 * retrying after a network/5xx failure it says so instead of staying blank.
 */
export function SessionPending() {
  const reconnecting = useSessionStore((state) => state.reconnecting);

  return (
    <div
      role="status"
      aria-live="polite"
      className="p-safe bg-bg text-mute flex h-dvh flex-col items-center justify-center gap-3"
    >
      <Dots />
      {reconnecting ? <p>Нет сети, подключаемся…</p> : null}
    </div>
  );
}
