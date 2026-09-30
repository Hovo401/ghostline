import { myReaction, useSetReaction, type ChatMessage } from "../../entities/message";
import { useCurrentUserId } from "../../entities/user";

interface ReactionBarProps {
  message: ChatMessage;
  isOwn: boolean;
}

/**
 * FR-MSG-13: the chips under a bubble. A tap toggles your own reaction on
 * that emoji (tapping another chip moves it — one reaction per user).
 */
export function ReactionBar({ message, isOwn }: ReactionBarProps) {
  const currentUserId = useCurrentUserId();
  const setReaction = useSetReaction();
  const mine = myReaction(message, currentUserId);

  return (
    <div
      role="group"
      aria-label="Реакции"
      className={[
        "flex max-w-[min(520px,82%)] flex-wrap gap-1.5",
        isOwn ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {message.reactions.map((reaction) => {
        const isMine = reaction.emoji === mine;
        return (
          <button
            key={reaction.emoji}
            type="button"
            aria-pressed={isMine}
            aria-label={`${reaction.emoji} ${String(reaction.count)}${isMine ? ", включая вашу" : ""}`}
            disabled={currentUserId === null}
            onClick={() => {
              if (currentUserId === null) return;
              setReaction.mutate({
                message,
                userId: currentUserId,
                emoji: isMine ? null : reaction.emoji,
              });
            }}
            // The ::before widens the tap target to ~48px without making the chip taller.
            className={[
              "relative flex h-7 min-w-11 animate-reaction-pop items-center justify-center gap-1 rounded-full border px-2 text-[13px] before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']",
              isMine
                ? "border-accent-text bg-bg2 text-accent-text"
                : "border-line bg-bg2 text-fg hover:border-mute",
            ].join(" ")}
          >
            <span aria-hidden>{reaction.emoji}</span>
            <span aria-hidden className="font-mono text-xs">
              {reaction.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
