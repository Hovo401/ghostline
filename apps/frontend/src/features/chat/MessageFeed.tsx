import { useEffect, useRef } from "react";

import {
  type ChatMessage,
  groupMessages,
  lastOutgoingIndex,
  useSendMessage,
} from "../../entities/message";
import { Dots } from "../../shared/ui/dots";

import { MessageBubble } from "./MessageBubble";

/** Cascade step for decrypting the last few messages on open — DESIGN-
 * BRIEF.md §5 ("шаг 70 ms"). Only applied to a short tail so opening a long
 * history doesn't queue up dozens of staggered animations. */
const CASCADE_STEP_MS = 70;
const CASCADE_TAIL = 5;

interface MessageFeedProps {
  chatId: string;
  messages: ChatMessage[];
  currentUserId: string | null;
  peerTyping: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function MessageFeed({
  chatId,
  messages,
  currentUserId,
  peerTyping,
  hasMore,
  onLoadMore,
}: MessageFeedProps) {
  const { retry } = useSendMessage(chatId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const groups = groupMessages(messages, currentUserId);
  const lastOwnIndex = lastOutgoingIndex(messages, currentUserId);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, chatId, peerTyping]);

  return (
    <div ref={scrollRef} className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4.5 py-5">
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          className="mx-auto mb-2 rounded-xl border border-line px-3 py-1.5 font-mono text-xs text-mute"
        >
          Загрузить раньше
        </button>
      )}
      {groups.map(({ message, isOwn, groupStart }, index) => {
        const tailPosition = messages.length - index;
        const scrambleDelay =
          tailPosition <= CASCADE_TAIL ? (CASCADE_TAIL - tailPosition) * CASCADE_STEP_MS : 0;
        return (
          <div key={message.id} className={index > 0 && groupStart ? "mt-3" : undefined}>
            <MessageBubble
              message={message}
              isOwn={isOwn}
              isLastOutgoing={index === lastOwnIndex}
              scrambleDelay={scrambleDelay}
              onRetry={retry}
            />
          </div>
        );
      })}
      {peerTyping && (
        <div className="mt-2.5 self-start rounded-bubble border border-line bg-in px-4 py-3.5 text-mute">
          <Dots />
        </div>
      )}
    </div>
  );
}
