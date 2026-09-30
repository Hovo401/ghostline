import { useState } from "react";

import {
  canDeleteMessage,
  canEditMessage,
  useDeleteMessage,
  type ChatMessage,
} from "../../entities/message";
import { Backdrop } from "../../shared/ui/backdrop";

import { useChatUiStore } from "./chat-ui-store";

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

// Rough menu footprint — enough to keep it on screen near the right/bottom
// edges without measuring the DOM after render.
const MENU_WIDTH = 220;
const MENU_HEIGHT = 150;
const EDGE = 8;

const ITEM = "flex h-11 w-full items-center rounded-lg px-3 text-left text-[14.5px] hover:bg-bg2";

/**
 * Right-click / long-press menu on a bubble (FR-MSG-11): copy, edit
 * (FR-MSG-05) and "delete for everyone" (FR-MSG-06) with an inline
 * confirmation step instead of a separate modal.
 */
export function MessageContextMenu({
  message,
  point,
  currentUserId,
  onClose,
}: MessageContextMenuProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const startEditing = useChatUiStore((state) => state.startEditing);
  const deleteMessage = useDeleteMessage();

  const canCopy = !!message.text;
  const canEdit = canEditMessage(message, currentUserId);
  const canDelete = canDeleteMessage(message, currentUserId);

  const left = Math.max(EDGE, Math.min(point.x, window.innerWidth - MENU_WIDTH - EDGE));
  const top = Math.max(EDGE, Math.min(point.y, window.innerHeight - MENU_HEIGHT - EDGE));

  return (
    <>
      <Backdrop open onClose={onClose} className="bg-transparent" />
      <div
        role="menu"
        style={{ left, top, width: MENU_WIDTH }}
        className="fixed z-50 flex flex-col rounded-2xl border border-line bg-panel p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.3)]"
      >
        {confirmingDelete ? (
          <>
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
          </>
        ) : (
          <>
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
                  setConfirmingDelete(true);
                }}
                className={`${ITEM} text-danger`}
              >
                Удалить
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
