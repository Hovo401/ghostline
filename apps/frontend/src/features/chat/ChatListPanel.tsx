import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { useChats } from "../../entities/chat";
import { useCurrentUserId } from "../../entities/user";
import { useSessionStore } from "../../shared/api/session-store";
import { Avatar } from "../../shared/ui/avatar";

import { useChatUiStore } from "./chat-ui-store";
import { ChatListRow } from "./ChatListRow";
import { chatDisplayName } from "./format";
import { NotificationInviteBanner } from "./NotificationInviteBanner";

/** Chat list column — DESIGN-BRIEF.md §7.2: header + "Новый", search, rows
 * (avatar/name/time/preview or typing, unread badge). On phone this is the
 * whole screen until a chat is selected (see Chat.tsx's layout classes). */
export function ChatListPanel({ className }: { className?: string }) {
  const { data: chats, isLoading } = useChats();
  const currentUserId = useCurrentUserId();
  const selectedChatId = useChatUiStore((state) => state.selectedChatId);
  const selectChat = useChatUiStore((state) => state.selectChat);
  const listFilter = useChatUiStore((state) => state.listFilter);
  const setListFilter = useChatUiStore((state) => state.setListFilter);
  const me = useSessionStore((state) => state.user);
  const openNewChatModal = useChatUiStore((state) => state.openNewChatModal);

  const filtered = useMemo(() => {
    const needle = listFilter.trim().toLowerCase();
    if (!needle) return chats ?? [];
    return (chats ?? []).filter((chat) => chatDisplayName(chat).toLowerCase().includes(needle));
  }, [chats, listFilter]);

  return (
    <div
      className={["flex min-h-0 w-full flex-col border-r border-line bg-bg md:w-85", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-col gap-3.5 px-4.5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <h1 className="mr-auto text-2xl font-medium tracking-tight">Чаты</h1>
          <Link
            to="/"
            className="flex h-8.5 items-center rounded-xl border border-line px-3 text-sm"
          >
            Главная
          </Link>
          <button
            type="button"
            onClick={openNewChatModal}
            className="h-8.5 rounded-xl border border-line px-3 text-sm"
          >
            Новый
          </button>
          <Link
            to="/settings"
            aria-label="Настройки"
            title="Настройки"
            className="flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-line text-base md:hidden"
          >
            <span aria-hidden>{"⚙"}</span>
          </Link>
        </div>
        <input
          value={listFilter}
          onChange={(e) => {
            setListFilter(e.target.value);
          }}
          placeholder="Поиск"
          className="h-10 rounded-xl border border-line bg-bg2 px-3.5 text-sm text-fg outline-none focus-visible:border-accent-text"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <NotificationInviteBanner />
        {isLoading && <p className="p-3 font-mono text-xs text-mute">Загрузка…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="p-3 font-mono text-xs text-mute">Ничего не найдено</p>
        )}
        {filtered.map((chat) => (
          <ChatListRow
            key={chat.id}
            chat={chat}
            active={chat.id === selectedChatId}
            currentUserId={currentUserId}
            onSelect={selectChat}
          />
        ))}
      </div>

      {/* Desktop-only: the current user's avatar opens settings. On phone
       * the settings button lives in the header instead. */}
      {me && (
        <Link
          to="/settings"
          className="hidden items-center gap-3 border-t border-line px-4.5 pt-3 pb-4 hover:bg-bg2 md:flex"
        >
          <Avatar name={me.displayName} src={me.avatarUrl ?? undefined} size={46} />
          <span className="min-w-0 flex-1 truncate text-sm">{me.displayName}</span>
          <span aria-hidden className="font-mono text-base text-mute">
            {"⚙"}
          </span>
        </Link>
      )}
    </div>
  );
}
