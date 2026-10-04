import { useToastStore } from "./toast-store";

/**
 * Toast stack — mounted once in `routes/app.tsx` near `<MediaViewer/>`.
 * Renders nothing while `toast-store`'s queue is empty. Enter/exit
 * animation is the `animate-toast-in`/`animate-toast-out` keyframes in
 * `shared/theme/theme.css` (tokens only, no literal colors/durations here).
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+var(--safe-bottom))] z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.variant === "error" ? "alert" : "status"}
          className={[
            "pointer-events-auto flex max-w-sm animate-toast-in items-center gap-3 rounded-xl border px-4 py-3 text-[14px] shadow-[0_18px_50px_rgba(0,0,0,.3)]",
            toast.variant === "error"
              ? "border-danger/40 bg-panel text-danger"
              : "border-line bg-panel text-fg",
          ].join(" ")}
        >
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                dismiss(toast.id);
              }}
              className="flex-none font-mono text-xs font-semibold text-accent-text underline"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Закрыть уведомление"
            onClick={() => {
              dismiss(toast.id);
            }}
            className="flex-none text-mute"
          >
            {"✕"}
          </button>
        </div>
      ))}
    </div>
  );
}
