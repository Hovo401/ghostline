import { useEffect } from "react";

import { useCallActions, useCallStore } from "../../entities/call";
import { type ChatListItem, useMarkChatRead, useTypingStore } from "../../entities/chat";
import { useMessages } from "../../entities/message";
import { useCurrentUserId } from "../../entities/user";
import { Avatar } from "../../shared/ui/avatar";
import { PhoneIcon, VideoCameraIcon } from "../../shared/ui/call-icons";
import { IconButton } from "../../shared/ui/icon-button";

import { useChatUiStore } from "./chat-ui-store";
import { Composer } from "./Composer";
import { chatDisplayName } from "./format";
import { MessageFeed } from "./MessageFeed";
import { ProfilePanel } from "./ProfilePanel";

interface ChatThreadPanelProps {
  chat: ChatListItem;
  className?: string;
}

/** Right column — DESIGN-BRIEF.md §7.2 header/feed/composer, plus the
 * profile side panel that slides over it. */
export function ChatThreadPanel({ chat, className }: ChatThreadPanelProps) {
  const currentUserId = useCurrentUserId();
  const { messages, hasNextPage, fetchNextPage } = useMessages(chat.id);
  const markRead = useMarkChatRead();
  const { start: startCall } = useCallActions();
  const callInProgress = useCallStore((state) => state.phase !== "idle");
  const closeChat = useChatUiStore((state) => state.closeChat);
  const profilePanelOpen = useChatUiStore((state) => state.profilePanelOpen);
  const openProfilePanel = useChatUiStore((state) => state.openProfilePanel);
  const closeProfilePanel = useChatUiStore((state) => state.closeProfilePanel);
  const peerId = chat.peer?.id;
  const peerTyping = useTypingStore(
    (state) => peerId !== undefined && state.byChat[chat.id]?.userId === peerId,
  );

  const markReadMutate = markRead.mutate;
  useEffect(() => {
    // Re-marks read on open and whenever a new message arrives while this
    // thread is the active one (FR-RT-04) — `mutate`'s reference is stable,
    // so this only re-runs on an actual chat switch or message count change.
    markReadMutate(chat.id);
  }, [chat.id, messages.length, markReadMutate]);

  const statusLine = peerTyping
    ? "печатает…"
    : chat.peer
      ? chat.peer.online
        ? "в сети"
        : "не в сети"
      : "заметки для себя";

  return (
    <div
      className={["relative flex min-h-0 min-w-0 flex-1 flex-col bg-bg2", className]
        .filter(Boolean)
        .join(" ")}
    >
      {/* ProfilePanel itself stays `absolute` (it slides in as an overlay
       * with its own scrim, DESIGN-BRIEF.md §7.2), but the thread's own
       * content needs to actually narrow when it's open — on desktop,
       * reserving its width here so the header/feed/composer reflow inside
       * the remaining space, rather than keeping their old width and
       * ending up hidden underneath the now-opaque panel. */}
      <div
        className={[
          "flex min-h-0 min-w-0 flex-1 flex-col transition-[padding-right] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]",
          profilePanelOpen ? "md:pr-95" : "md:pr-0",
        ].join(" ")}
      >
        <div className="flex h-17 flex-none items-center gap-3 border-b border-line bg-bg px-4">
          <button
            type="button"
            onClick={closeChat}
            className="-ml-2 flex h-11 w-11 items-center justify-center text-xl md:hidden"
            aria-label="Назад к чатам"
          >
            {"←"}
          </button>
          <button
            type="button"
            onClick={openProfilePanel}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            title="Открыть профиль"
          >
            <Avatar name={chatDisplayName(chat)} size={38} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[15.5px] font-medium">{chatDisplayName(chat)}</span>
              <span
                className={[
                  "font-mono text-[11.5px]",
                  peerTyping ? "text-accent-text" : "text-mute",
                ].join(" ")}
              >
                {statusLine}
              </span>
            </span>
          </button>
          {chat.peer && (
            <div className="flex flex-none items-center gap-1">
              <IconButton
                icon={<PhoneIcon />}
                label="Аудиозвонок"
                disabled={callInProgress}
                onClick={() => {
                  startCall({ chatId: chat.id, video: false });
                }}
              />
              <IconButton
                icon={<VideoCameraIcon />}
                label="Видеозвонок"
                disabled={callInProgress}
                onClick={() => {
                  startCall({ chatId: chat.id, video: true });
                }}
              />
            </div>
          )}
        </div>

        <MessageFeed
          chatId={chat.id}
          messages={messages}
          currentUserId={currentUserId}
          peerTyping={peerTyping}
          hasMore={hasNextPage}
          onLoadMore={() => {
            void fetchNextPage();
          }}
        />

        <Composer chatId={chat.id} />
      </div>

      <ProfilePanel chat={chat} open={profilePanelOpen} onClose={closeProfilePanel} />
    </div>
  );
}
