import { useChats } from "../../entities/chat";
import { hasGhostlinePlugin } from "../../shared/native";

import { CallSetupScreen } from "./CallSetupScreen";
import { useChatUiStore } from "./chat-ui-store";
import { ChatListPanel } from "./ChatListPanel";
import { ChatThreadPanel } from "./ChatThreadPanel";
import { NewChatModal } from "./NewChatModal";
import { NotificationPrompt } from "./NotificationPrompt";
import { useSelectedChatId } from "./use-chat-navigation";

/**
 * The whole "Мессенджер" screen (DESIGN-BRIEF.md §7.2) — desktop chat list + thread side by side; on phone, one column at a time (list or
 * thread) switched by `?chat=`, per DESIGN-BRIEF.md §4's phone
 * layout. Media (image/file/voice/video bubbles + the attach/record flow,
 * F4) lives in Composer/MessageBubble; group chats and disappearing
 * messages are still out of scope here — see BACKLOG.md. The socket and
 * realtime subscriptions live a level up, in `useMessengerSession`.
 */
export function Chat() {
  const { data: chats } = useChats();
  const selectedChatId = useSelectedChatId();
  const newChatModalOpen = useChatUiStore((state) => state.newChatModalOpen);

  const selectedChat = chats?.find((c) => c.id === selectedChatId) ?? null;

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-fg">
      {/* Keyed on the resolved chat, not the raw `?chat=` — a stale or
       * mistyped id in the URL shows the list instead of a blank phone. */}
      <ChatListPanel className={selectedChat ? "hidden md:flex" : "flex"} />

      {selectedChat ? (
        <ChatThreadPanel key={selectedChat.id} chat={selectedChat} className="flex" />
      ) : (
        <div className="hidden flex-1 items-center justify-center bg-bg2 md:flex">
          <p className="font-mono text-sm text-mute">{"// выберите чат"}</p>
        </div>
      )}

      {newChatModalOpen && <NewChatModal />}
      {hasGhostlinePlugin() ? <CallSetupScreen /> : <NotificationPrompt />}
    </div>
  );
}
