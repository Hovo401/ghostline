import { Link } from "@tanstack/react-router";

import { useActiveCallQuery, useCallRealtime } from "../../entities/call";
import { useChatRealtime, useChats, useTypingRealtime } from "../../entities/chat";
import { useMessageRealtime } from "../../entities/message";
import { useMessageNotificationFallback, usePushSubscription } from "../../entities/notification";
import { useMeRealtime } from "../../entities/session";
import { useSessionStore } from "../../shared/api/session-store";
import { useGhostlineSocket } from "../../shared/api/socket-client";
import { Avatar } from "../../shared/ui/avatar";

import { useChatUiStore } from "./chat-ui-store";
import { ChatListPanel } from "./ChatListPanel";
import { ChatThreadPanel } from "./ChatThreadPanel";
import { NewChatModal } from "./NewChatModal";
import { useNotificationDeepLink } from "./use-notification-deep-link";
import { useServiceWorkerMessages } from "./use-service-worker-messages";

/**
 * The whole "Мессенджер" screen (DESIGN-BRIEF.md §7.2) — desktop rail +
 * chat list + thread side by side; on phone, one column at a time (list or
 * thread) switched by `selectedChatId`, per DESIGN-BRIEF.md §4's phone
 * layout. Media (image/file/voice/video bubbles + the attach/record flow,
 * F4) lives in Composer/MessageBubble; group chats and disappearing
 * messages are still out of scope here — see BACKLOG.md.
 */
export function Chat() {
  useGhostlineSocket();
  useChatRealtime();
  useMessageRealtime();
  useTypingRealtime();
  useMeRealtime();
  useCallRealtime();
  useActiveCallQuery();
  const { status: pushStatus } = usePushSubscription();
  useMessageNotificationFallback(pushStatus !== "subscribed");
  useServiceWorkerMessages();
  useNotificationDeepLink();

  const { data: chats } = useChats();
  const selectedChatId = useChatUiStore((state) => state.selectedChatId);
  const closeChat = useChatUiStore((state) => state.closeChat);
  const newChatModalOpen = useChatUiStore((state) => state.newChatModalOpen);
  const me = useSessionStore((state) => state.user);

  const selectedChat = chats?.find((c) => c.id === selectedChatId) ?? null;
  const hasUnread = (chats ?? []).some((c) => c.unreadCount > 0);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-fg">
      <nav className="hidden w-19 flex-none flex-col items-center gap-2.5 border-r border-line bg-bg py-4.5 md:flex">
        <span
          aria-hidden
          className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-xl text-lg font-semibold [background:var(--color-accent)] text-ink"
        >
          g
        </span>
        <button
          type="button"
          onClick={closeChat}
          className="flex h-13 w-15 flex-col items-center justify-center gap-0.5 rounded-xl bg-bg2 text-[11.5px] text-fg"
        >
          <span aria-hidden className="font-mono text-[15px]">
            {hasUnread ? "◉" : "○"}
          </span>
          Чаты
        </button>
        <Link
          to="/settings"
          className="flex h-13 w-15 flex-col items-center justify-center gap-0.5 rounded-xl text-[11.5px] text-mute"
        >
          <span aria-hidden className="font-mono text-[15px]">
            {"◐"}
          </span>
          Настройки
        </Link>
        <div className="flex-1" />
        {me && <Avatar name={me.displayName} src={me.avatarUrl ?? undefined} size={36} />}
      </nav>

      <ChatListPanel className={selectedChatId ? "hidden md:flex" : "flex"} />

      {selectedChat ? (
        <ChatThreadPanel
          key={selectedChat.id}
          chat={selectedChat}
          className={selectedChatId ? "flex" : "hidden md:flex"}
        />
      ) : (
        <div className="hidden flex-1 items-center justify-center bg-bg2 md:flex">
          <p className="font-mono text-sm text-mute">{"// выберите чат"}</p>
        </div>
      )}

      {newChatModalOpen && <NewChatModal />}
    </div>
  );
}
