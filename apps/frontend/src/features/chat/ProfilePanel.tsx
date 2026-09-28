import type { CSSProperties } from "react";

import { type Attachment, fileExtension } from "../../entities/attachment";
import { type ChatListItem, useChatMedia, useMuteChat } from "../../entities/chat";
import { useBlockUser } from "../../entities/user";
import { Avatar } from "../../shared/ui/avatar";
import { IconButton } from "../../shared/ui/icon-button";

import { chatDisplayName } from "./format";

interface ProfilePanelProps {
  chat: ChatListItem;
  open: boolean;
  onClose: () => void;
}

function stagger(step: number): CSSProperties {
  return { transitionDelay: `${(step * 60 + 80).toString()}ms` };
}

/** One "МЕДИА" grid cell — a real photo thumbnail, or (file/voice/video)
 * the same extension badge MessageBubble's file chip uses, reusing
 * `fileExtension` instead of re-deriving it. */
function MediaGridItem({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.mime.startsWith("image/");
  return (
    <div className="relative flex aspect-square items-end justify-end overflow-hidden rounded-lg bg-panel p-1.5">
      {isImage ? (
        <img
          src={attachment.url}
          alt={attachment.name ?? "Фото"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="font-mono text-[10px] text-mute">
          {fileExtension(attachment.name, attachment.mime)}
        </span>
      )}
    </div>
  );
}

/** Slide-in panel — DESIGN-BRIEF.md §7.2: 500ms slide + scrim, staggered
 * content fade (80ms step). Groups/leave-group and disappearing messages
 * are out of F3's scope (BACKLOG.md "Отложено"), so the row list here is
 * just notifications (mute) and block. */
export function ProfilePanel({ chat, open, onClose }: ProfilePanelProps) {
  const muteChat = useMuteChat();
  const blockUser = useBlockUser();
  const media = useChatMedia(chat.id, open);
  const name = chatDisplayName(chat);
  const peer = chat.peer;

  const fadeClass = (extra: string): string =>
    [
      extra,
      "transition-[opacity,transform] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]",
      open ? "translate-y-0 opacity-100" : "translate-y-3.5 opacity-0",
    ].join(" ");

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        className={[
          "absolute inset-0 z-8 bg-bg/35 transition-opacity duration-350",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />
      <div
        className={[
          "absolute inset-y-0 right-0 z-9 flex w-full max-w-95 flex-col border-l border-line bg-bg shadow-glow transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)]",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-17 flex-none items-center justify-between border-b border-line pr-3 pl-5">
          <span className="text-[15px] font-medium">Профиль</span>
          <IconButton icon={<span aria-hidden>{"✕"}</span>} label="Закрыть" onClick={onClose} />
        </div>

        <div className="flex flex-1 flex-col gap-6.5 overflow-y-auto px-5 pt-7 pb-8">
          <div
            className={fadeClass("flex flex-col items-center gap-3.5 text-center")}
            style={stagger(0)}
          >
            <Avatar name={name} size={112} online={peer?.online} ring />
            <div className="flex flex-col gap-1">
              <div className="text-[22px] font-medium tracking-tight">{name}</div>
              {peer && <div className="font-mono text-xs text-accent-text">@{peer.username}</div>}
              <div className="text-sm text-mute">
                {peer ? (peer.online ? "в сети" : "не в сети") : "только вы"}
              </div>
            </div>
          </div>

          {peer && (
            <div className={fadeClass("grid grid-cols-2 gap-2")} style={stagger(1)}>
              <button
                type="button"
                onClick={() => {
                  muteChat.mutate({ chatId: chat.id, muted: !chat.muted });
                }}
                className="flex flex-col items-center gap-1.5 rounded-[14px] border border-line bg-bg2 px-1 py-3 text-xs hover:border-accent-text"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10.3 21a2 2 0 003.4 0" />
                </svg>
                {chat.muted ? "Включить звук" : "Без звука"}
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-1.5 rounded-[14px] border border-line bg-bg2 px-1 py-3 text-xs hover:border-accent-text"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
                Поиск
              </button>
            </div>
          )}

          {media.data && media.data.length > 0 && (
            // No card treatment here (unlike the notifications/block list
            // below) — the prototype's "Медиа" section is a plain column
            // spanning the panel's full content width; a bg2/padding
            // wrapper would shrink the grid below the prototype's cell size.
            <div className={fadeClass("flex flex-col gap-2.5")} style={stagger(2)}>
              <span className="flex items-baseline justify-between">
                <span className="text-[15px] font-medium">Медиа</span>
                <span className="font-mono text-xs text-mute">{media.data.length}</span>
              </span>
              <div className="grid grid-cols-3 gap-1">
                {media.data.map((attachment) => (
                  <MediaGridItem key={attachment.id} attachment={attachment} />
                ))}
              </div>
            </div>
          )}

          {peer && (
            <div
              className={fadeClass(
                "flex flex-col overflow-hidden rounded-[14px] border border-line",
              )}
              style={stagger(3)}
            >
              <button
                type="button"
                onClick={() => {
                  muteChat.mutate({ chatId: chat.id, muted: !chat.muted });
                }}
                className="flex items-center justify-between gap-3 px-4 py-3.5 text-left text-sm hover:bg-bg2"
              >
                <span>Уведомления</span>
                <span className="text-xs text-mute">{chat.muted ? "Выключены" : "Включены"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  blockUser.mutate(peer.id);
                }}
                className="flex items-center justify-between gap-3 border-t border-line px-4 py-3.5 text-left text-sm hover:bg-bg2"
              >
                <span className="text-danger">Заблокировать</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
