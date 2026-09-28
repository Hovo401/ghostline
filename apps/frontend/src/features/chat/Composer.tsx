import type { KeyboardEvent } from "react";

import { useEmitTyping } from "../../entities/chat";
import { useSendMessage } from "../../entities/message";
import { IconButton } from "../../shared/ui/icon-button";

import { useChatUiStore } from "./chat-ui-store";

/**
 * Message input — DESIGN-BRIEF.md §7.2: "пилюля" text field, circular send
 * button once there's a draft. Attach/voice/video are F4's scope (media);
 * rendered as inert icons here so the row matches the prototype's layout
 * without wiring up functionality that isn't built yet.
 */
export function Composer({ chatId }: { chatId: string }) {
  const draft = useChatUiStore((state) => state.drafts[chatId] ?? "");
  const setDraft = useChatUiStore((state) => state.setDraft);
  const { send } = useSendMessage(chatId);
  const emitTyping = useEmitTyping(chatId);

  const submit = (): void => {
    if (!draft.trim()) return;
    send(draft);
    setDraft(chatId, "");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex items-center gap-2 border-t border-line bg-bg px-4 pt-3 pb-4">
      <IconButton
        icon={
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
            <path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9" />
          </svg>
        }
        label="Прикрепить"
      />
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(chatId, e.target.value);
          emitTyping();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Сообщение"
        rows={1}
        className="h-11.5 max-h-32 min-w-0 flex-1 resize-none rounded-[23px] border border-line bg-bg2 px-4 py-2.5 text-[15px] text-fg outline-none focus-visible:border-accent-text"
      />
      {draft.trim() ? (
        <IconButton
          icon={<span aria-hidden>{"↑"}</span>}
          label="Отправить"
          variant="accent"
          onClick={submit}
        />
      ) : (
        <>
          <IconButton
            icon={
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
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0014 0M12 18v3" />
              </svg>
            }
            label="Голосовое сообщение"
          />
          <IconButton
            icon={
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
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
            }
            label="Видеосообщение"
          />
        </>
      )}
    </div>
  );
}
