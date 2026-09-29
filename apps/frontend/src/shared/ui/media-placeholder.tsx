import { ProgressRing } from "./progress-ring";

export interface MediaPlaceholderProps {
  status: "checking" | "idle" | "loading" | "error";
  /** 0-100 while loading. */
  percent: number;
  /** "3.0 МБ" when idle, "1.2 / 3.0 МБ" while loading. */
  label: string;
  onStart: () => void;
  onCancel: () => void;
  /** Smaller variant without the size pill (profile media grid). */
  compact?: boolean;
}

function ArrowDownIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4v14M6 12l6 6 6-6" />
    </svg>
  );
}

/** Textured stand-in surface for media that isn't on screen yet — a soft
 * accent glow plus fine diagonal hatching, all from theme tokens, so an
 * undownloaded photo/video reads as "media here", not as a broken black box. */
export function MediaBackdrop({ icon }: { icon: "photo" | "video" }) {
  return (
    <span
      aria-hidden
      className="absolute inset-0 overflow-hidden bg-bg2"
      style={{
        backgroundImage: [
          "radial-gradient(120% 90% at 15% 10%, color-mix(in srgb, var(--color-accent-text) 22%, transparent), transparent 60%)",
          "radial-gradient(90% 80% at 90% 100%, color-mix(in srgb, var(--color-accent-text) 12%, transparent), transparent 55%)",
          "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-line) 55%, transparent) 0 1px, transparent 1px 11px)",
        ].join(", "),
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute -right-4 -bottom-5 h-32 w-32 text-mute opacity-15"
      >
        {icon === "photo" ? (
          <>
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <circle cx="9" cy="10" r="1.8" />
            <path d="M21 16l-5-5-8 9" />
          </>
        ) : (
          <>
            <rect x="2.5" y="5" width="14" height="14" rx="2.5" />
            <path d="M16.5 10l5-3v10l-5-3z" />
          </>
        )}
      </svg>
    </span>
  );
}

/**
 * Stand-in for a photo/video note that isn't downloaded yet (docs/adr/0013)
 * — fills its parent (which reserves the media's aspect ratio): "↓ size"
 * button when idle, a progress ring with ✕ while loading, "↻" on error.
 */
export function MediaPlaceholder({
  status,
  percent,
  label,
  onStart,
  onCancel,
  compact = false,
}: MediaPlaceholderProps) {
  const circle = compact ? "h-9 w-9" : "h-12 w-12";
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-fg">
      <MediaBackdrop icon="photo" />
      {status === "loading" ? (
        <button
          type="button"
          aria-label="Отменить загрузку"
          onClick={(event) => {
            event.stopPropagation();
            onCancel();
          }}
          className={`relative flex ${circle} items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm`}
        >
          <ProgressRing
            percent={percent}
            size={compact ? 36 : 48}
            strokeWidth={3}
            colorClassName="text-white"
            className="absolute inset-0"
          />
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : status === "idle" || status === "error" ? (
        <button
          type="button"
          aria-label={status === "error" ? "Повторить загрузку" : "Загрузить"}
          onClick={(event) => {
            event.stopPropagation();
            onStart();
          }}
          className={`relative flex ${circle} items-center justify-center rounded-full bg-accent text-ink shadow-glow transition-transform hover:scale-105 active:scale-95`}
        >
          {status === "error" ? "↻" : <ArrowDownIcon />}
        </button>
      ) : null}
      {!compact && status !== "checking" && (
        <span className="relative rounded-full bg-black/55 px-2.5 py-0.5 font-mono text-[11px] text-white backdrop-blur-sm">
          {label}
        </span>
      )}
    </div>
  );
}
