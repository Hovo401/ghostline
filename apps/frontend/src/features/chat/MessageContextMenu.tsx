import { useState } from "react";

import {
  QUICK_REACTIONS,
  canDeleteMessage,
  canEditMessage,
  canReactToMessage,
  myReaction,
  useDeleteMessage,
  useSetReaction,
  type ChatMessage,
} from "../../entities/message";
import { Backdrop } from "../../shared/ui/backdrop";

import { useChatUiStore } from "./chat-ui-store";
import { EmojiPicker } from "./EmojiPicker";

export interface MenuPoint {
  x: number;
  y: number;
}

interface MessageContextMenuProps {
  message: ChatMessage;
  point: MenuPoint;
  currentUserId: string | null;
  onClose: () => void;
}

type MenuView = "menu" | "picker" | "confirm-delete";

// Rough footprint per view — enough to keep the menu on screen near the
// right/bottom edges without measuring the DOM after render.
const MENU_WIDTH = 296;
const PICKER_WIDTH = 320;
const PICKER_HEIGHT = 380;
const REACTION_ROW_HEIGHT = 52;
const ITEM_HEIGHT = 44;
const PANEL_PADDING = 12;
const GAP = 8;
const EDGE = 8;

const ITEM = "flex h-11 w-full items-center rounded-lg px-3 text-left text-[14.5px] hover:bg-bg2";
const PANEL =
  "rounded-2xl border border-line bg-panel shadow-[0_18px_50px_rgba(0,0,0,.3)] animate-dialog-in";

/**
 * Right-click / long-press menu on a bubble (FR-MSG-11): a reaction row
 * (FR-MSG-13: six quick emoji + "＋" for the full picker), then copy, edit
 * (FR-MSG-05) and "delete for everyone" (FR-MSG-06) with an inline
 * confirmation step instead of a separate modal.
 */
export function MessageContextMenu({
  message,
  point,
  currentUserId,
  onClose,
}: MessageContextMenuProps) {
  const [view, setView] = useState<MenuView>("menu");
  const startEditing = useChatUiStore((state) => state.startEditing);
  const deleteMessage = useDeleteMessage();
  const setReaction = useSetReaction();

  const canCopy = !!message.text;
  const canEdit = canEditMessage(message, currentUserId);
  const canDelete = canDeleteMessage(message, currentUserId);
  const canReact = canReactToMessage(message) && currentUserId !== null;
  const mine = myReaction(message, currentUserId);
  const actionCount = [canCopy, canEdit, canDelete].filter(Boolean).length;

  // Picking the emoji you already have clears it (same as tapping its chip).
  const react = (emoji: string): void => {
    if (currentUserId === null) return;
    setReaction.mutate({
      message,
      userId: currentUserId,
      emoji: emoji === mine ? null : emoji,
    });
    onClose();
  };

  const width =
    view === "picker" ? Math.min(PICKER_WIDTH, window.innerWidth - 2 * EDGE) : MENU_WIDTH;
  const height =
    view === "picker"
      ? PICKER_HEIGHT
      : view === "confirm-delete"
        ? PANEL_PADDING + 3 * ITEM_HEIGHT
        : (canReact ? REACTION_ROW_HEIGHT + GAP : 0) +
          (actionCount > 0 ? PANEL_PADDING + actionCount * ITEM_HEIGHT : 0);
  const left = Math.max(EDGE, Math.min(point.x, window.innerWidth - width - EDGE));
  const top = Math.max(EDGE, Math.min(point.y, window.innerHeight - height - EDGE));

  return (
    <>
      <Backdrop open onClose={onClose} className="bg-transparent" />
      <div style={{ left, top, width }} className="fixed z-50 flex flex-col gap-2">
        {view === "picker" && (
          <div className={`${PANEL} flex overflow-hidden`} style={{ height: PICKER_HEIGHT }}>
            <EmojiPicker onSelect={react} className="h-full w-full" />
          </div>
        )}

        {view === "menu" && canReact && (
          <div
            role="group"
            aria-label="Быстрые реакции"
            className={`${PANEL} flex items-center justify-between p-1`}
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Реакция ${emoji}`}
                aria-pressed={emoji === mine}
                onClick={() => {
                  react(emoji);
                }}
                className={[
                  "flex h-10 w-10 flex-none items-center justify-center rounded-full text-2xl hover:bg-bg2",
                  emoji === mine ? "bg-bg2" : "",
                ].join(" ")}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              aria-label="Больше реакций"
              onClick={() => {
                setView("picker");
              }}
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-xl text-mute hover:bg-bg2 hover:text-fg"
            >
              <span aria-hidden>{"＋"}</span>
            </button>
          </div>
        )}

        {view === "confirm-delete" && (
          <div role="menu" className={`${PANEL} flex w-55 flex-col p-1.5`}>
            <span className="px-3 pt-2 pb-1 text-[13px] text-mute">Удалить у всех?</span>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                deleteMessage.mutate(message);
                onClose();
              }}
              className={`${ITEM} text-danger`}
            >
              Удалить
            </button>
            <button type="button" role="menuitem" onClick={onClose} className={ITEM}>
              Отмена
            </button>
          </div>
        )}

        {view === "menu" && actionCount > 0 && (
          <div role="menu" className={`${PANEL} flex w-55 flex-col p-1.5`}>
            {canCopy && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void navigator.clipboard.writeText(message.text ?? "");
                  onClose();
                }}
                className={ITEM}
              >
                Копировать
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  startEditing(message.chatId, message.id, message.text ?? "");
                  onClose();
                }}
                className={ITEM}
              >
                Изменить
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setView("confirm-delete");
                }}
                className={`${ITEM} text-danger`}
              >
                Удалить
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
