import { useEffect, useMemo, useRef } from "react";

import { useMediaViewerStore, type Attachment } from "../../entities/attachment";
import { useCallActions } from "../../entities/call";
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
  const { start: startCall } = useCallActions();
  const scrollRef = useRef<HTMLDivElement>(null);
  const groups = groupMessages(messages, currentUserId);
  const lastOwnIndex = lastOutgoingIndex(messages, currentUserId);
  const openViewer = useMediaViewerStore((state) => state.open);

  // Tapping a call-history row (F-CALL history in the feed) calls back into
  // the same chat, in the same mode (audio/video) the original call was.
  const callBack = (message: ChatMessage): void => {
    if (message.type !== "call" || !message.call) return;
    startCall({ chatId, video: message.call.video });
  };

  // Gallery for the fullscreen viewer (T-033) — every image/video message
  // (`type: "video"`, a picked/gallery video — not the round `video_note`)
  // in the loaded feed, in feed order, so ←/→ pages through the chat's
  // media the way the prototype's viewer does, not just what's on screen.
  const galleryMessages = useMemo(
    () =>
      messages.filter(
        (message) => (message.type === "image" || message.type === "video") && message.attachment,
      ),
    [messages],
  );

  const openImageMessage = (messageId: string): void => {
    const index = galleryMessages.findIndex((message) => message.id === messageId);
    if (index === -1) return;
    const attachments = galleryMessages
      .map((message) => message.attachment)
      .filter((attachment): attachment is Attachment => attachment !== null);
    openViewer(attachments, index);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, chatId, peerTyping]);

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4.5 py-5"
    >
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
              onOpenImage={openImageMessage}
              onCallBack={callBack}
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
