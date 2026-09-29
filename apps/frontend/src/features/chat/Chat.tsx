import { useActiveCallQuery, useCallRealtime } from "../../entities/call";
import { useChatRealtime, useChats, useTypingRealtime } from "../../entities/chat";
import { useMessageRealtime } from "../../entities/message";
import { useMessageNotificationFallback, usePushSubscription } from "../../entities/notification";
import { useMeRealtime } from "../../entities/session";
import { useGhostlineSocket } from "../../shared/api/socket-client";

import { useChatUiStore } from "./chat-ui-store";
import { ChatListPanel } from "./ChatListPanel";
import { ChatThreadPanel } from "./ChatThreadPanel";
import { NewChatModal } from "./NewChatModal";
import { useNotificationDeepLink } from "./use-notification-deep-link";
import { useServiceWorkerMessages } from "./use-service-worker-messages";

/**
 * The whole "Мессенджер" screen (DESIGN-BRIEF.md §7.2) — desktop chat list + thread side by side; on phone, one column at a time (list or
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
  const newChatModalOpen = useChatUiStore((state) => state.newChatModalOpen);

  const selectedChat = chats?.find((c) => c.id === selectedChatId) ?? null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-fg">
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
