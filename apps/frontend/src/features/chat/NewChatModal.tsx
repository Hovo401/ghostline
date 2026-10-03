import { useState } from "react";

import { useOpenDirectChat } from "../../entities/chat";
import { useUserSearch } from "../../entities/user";
import { Avatar } from "../../shared/ui/avatar";
import { Backdrop } from "../../shared/ui/backdrop";
import { IconButton } from "../../shared/ui/icon-button";
import { TextField } from "../../shared/ui/text-field";

import { useChatUiStore } from "./chat-ui-store";
import { useOpenChat } from "./use-chat-navigation";

/**
 * "Новый" → search users by username/name → open (or reuse) a direct chat
 * — FR-CHAT-01/FR-USER-02. Not a shared/ui primitive: it's the only modal
 * the app needs right now, so it lives with the one feature that uses it
 * (no speculative "generic Dialog" component yet).
 */
export function NewChatModal() {
  const [query, setQuery] = useState("");
  const { data: results, isLoading } = useUserSearch(query);
  const openDirectChat = useOpenDirectChat();
  const closeNewChatModal = useChatUiStore((state) => state.closeNewChatModal);
  const openChat = useOpenChat();

  const handlePick = (userId: string): void => {
    openDirectChat.mutate(
      { userId },
      {
        // Replaces the modal's own history entry (`useOpenChat` sees it
        // on top), and that replacement is what closes the modal
        // (`useBackToClose` in its `Backdrop`) — Back from the chat then
        // returns to the list, not to a dead "modal" step.
        onSuccess: (chat) => {
          openChat(chat.id);
        },
      },
    );
  };

  return (
    <>
      <Backdrop open onClose={closeNewChatModal} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Новый чат"
        className="fixed top-24 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-4 rounded-2xl border border-line bg-panel p-5 shadow-glow"
      >
        <div className="flex items-center justify-between">
          <span className="text-base font-medium">Новый чат</span>
          <IconButton
            icon={<span aria-hidden>{"✕"}</span>}
            label="Закрыть"
            onClick={closeNewChatModal}
          />
        </div>
        <TextField
          autoFocus
          placeholder="Имя или @username"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {isLoading && <p className="p-2 font-mono text-xs text-mute">Поиск…</p>}
          {!isLoading && query.trim().length >= 2 && results?.length === 0 && (
            <p className="p-2 font-mono text-xs text-mute">Никого не нашлось</p>
          )}
          {results?.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => {
                handlePick(user.id);
              }}
              className="flex items-center gap-3 rounded-xl p-2 text-left hover:bg-bg2"
            >
              <Avatar
                name={user.displayName}
                src={user.avatarUrl ?? undefined}
                online={user.online}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{user.displayName}</span>
                <span className="truncate font-mono text-xs text-accent-text">
                  @{user.username}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
