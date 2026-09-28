import { type ChatMessage, formatMessageMeta } from "../../entities/message";
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

/** One text bubble + its status line — DESIGN-BRIEF.md §7.2. Media types
 * (image/file/voice/video) are F4's job; this only renders `type: "text"`,
 * showing a plain placeholder for anything else so the feed doesn't break
 * once those start arriving from the backend. */
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
      {message.type === "text" ? (
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
      ) : (
        <div className="max-w-[min(520px,82%)] rounded-bubble border border-line bg-in px-3.5 py-2.5 text-msg text-mute">
          {"// вложение — F4"}
        </div>
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
