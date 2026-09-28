import { type ChatListItem, useTypingStore } from "../../entities/chat";
import { Avatar } from "../../shared/ui/avatar";
import { Dots } from "../../shared/ui/dots";

import { chatDisplayName, chatPreview, formatChatTime } from "./format";

interface ChatListRowProps {
  chat: ChatListItem;
  active: boolean;
  currentUserId: string | null;
  onSelect: (chatId: string) => void;
}

export function ChatListRow({ chat, active, currentUserId, onSelect }: ChatListRowProps) {
  const peerId = chat.peer?.id;
  const typing = useTypingStore(
    (state) => peerId !== undefined && state.byChat[chat.id]?.userId === peerId,
  );
  const preview = chatPreview(chat, currentUserId);

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(chat.id);
      }}
      className={[
        "flex w-full items-center gap-3 rounded-xl p-2.5 text-left hover:bg-bg2",
        active ? "bg-bg2" : "",
      ].join(" ")}
    >
      <Avatar name={chatDisplayName(chat)} online={chat.peer?.online} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
            {chatDisplayName(chat)}
          </span>
          <span className="shrink-0 text-xs text-mute">
            {chat.lastMessage ? formatChatTime(chat.lastMessage.createdAt) : ""}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {typing ? (
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-accent-text">
              <Dots className="scale-80" /> печатает…
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm text-mute">{preview}</span>
          )}
          {chat.unreadCount > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-ink">
              {chat.unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
