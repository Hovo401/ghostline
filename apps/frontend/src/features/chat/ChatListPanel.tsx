import { useMemo } from "react";

import { useChats } from "../../entities/chat";
import { useCurrentUserId } from "../../entities/user";

import { useChatUiStore } from "./chat-ui-store";
import { ChatListRow } from "./ChatListRow";
import { chatDisplayName } from "./format";

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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-medium tracking-tight">Чаты</h1>
          <button
            type="button"
            onClick={openNewChatModal}
            className="h-8.5 rounded-xl border border-line px-3 text-sm"
          >
            Новый
          </button>
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

      {/* Phone-only bottom tab bar — DESIGN-BRIEF.md §4 "Раскладка телефона".
          "Настройки" has no screen to open yet (out of F3's scope), so it's
          rendered inert rather than linking to a route that doesn't exist. */}
      <div className="flex border-t border-line px-2 pt-2 pb-6 md:hidden">
        <button
          type="button"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-xs text-fg"
        >
          <span aria-hidden className="font-mono text-base">
            {(chats ?? []).some((c) => c.unreadCount > 0) ? "◉" : "○"}
          </span>
          Чаты
        </button>
        <button
          type="button"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-xs text-mute"
        >
          <span aria-hidden className="font-mono text-base">
            {"◐"}
          </span>
          Настройки
        </button>
      </div>
    </div>
  );
}
