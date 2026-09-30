import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Client-only messenger UI state — which chat is open, the profile panel
 * and "new chat" modal's visibility, the list search box, and per-chat
 * drafts. None of this is server state (contrast entities/chat's Query
 * hooks), so it's Zustand, colocated with the feature per
 * apps/frontend/CLAUDE.md. Only `drafts` persists (FR-LIST-05) — the rest
 * resets on reload same as the prototype.
 */
export const CHAT_UI_STORAGE_KEY = "ghostline:chat-drafts";

export interface EditingState {
  messageId: string;
  /** The text as sent — shown in the "Редактирование" strip, and compared
   * against `text` to skip a no-op PATCH. */
  original: string;
  text: string;
}

interface ChatUiState {
  selectedChatId: string | null;
  profilePanelOpen: boolean;
  newChatModalOpen: boolean;
  listFilter: string;
  drafts: Record<string, string>;
  /** Files picked/dropped/pasted, waiting on `AttachPreviewDialog` before
   * any upload starts (T-032 §4.4) — keyed by chat so switching chats
   * doesn't leak one chat's pending picker into another's `Composer`. Not
   * persisted: `File` objects aren't serializable, and this is a
   * transient, in-session-only selection anyway. */
  pendingAttachFiles: Record<string, File[]>;
  /** The own message `Composer` is editing instead of composing a new one
   * (FR-MSG-05) — keyed by chat like `drafts`, which it leaves untouched so
   * the draft comes back once editing ends. Not persisted. */
  editing: Record<string, EditingState>;
  selectChat: (chatId: string) => void;
  closeChat: () => void;
  openProfilePanel: () => void;
  closeProfilePanel: () => void;
  openNewChatModal: () => void;
  closeNewChatModal: () => void;
  setListFilter: (filter: string) => void;
  setDraft: (chatId: string, text: string) => void;
  openAttachDialog: (chatId: string, files: File[]) => void;
  closeAttachDialog: (chatId: string) => void;
  startEditing: (chatId: string, messageId: string, text: string) => void;
  setEditingText: (chatId: string, text: string) => void;
  cancelEditing: (chatId: string) => void;
}

export const useChatUiStore = create<ChatUiState>()(
  persist(
    (set) => ({
      selectedChatId: null,
      profilePanelOpen: false,
      newChatModalOpen: false,
      listFilter: "",
      drafts: {},
      pendingAttachFiles: {},
      editing: {},
      selectChat: (chatId) => {
        set({ selectedChatId: chatId, profilePanelOpen: false });
      },
      closeChat: () => {
        set({ selectedChatId: null, profilePanelOpen: false });
      },
      openProfilePanel: () => {
        set({ profilePanelOpen: true });
      },
      closeProfilePanel: () => {
        set({ profilePanelOpen: false });
      },
      openNewChatModal: () => {
        set({ newChatModalOpen: true });
      },
      closeNewChatModal: () => {
        set({ newChatModalOpen: false });
      },
      setListFilter: (filter) => {
        set({ listFilter: filter });
      },
      setDraft: (chatId, text) => {
        set((state) => ({ drafts: { ...state.drafts, [chatId]: text } }));
      },
      openAttachDialog: (chatId, files) => {
        set((state) => ({
          pendingAttachFiles: { ...state.pendingAttachFiles, [chatId]: files },
        }));
      },
      closeAttachDialog: (chatId) => {
        set((state) => {
          const { [chatId]: _removed, ...rest } = state.pendingAttachFiles;
          return { pendingAttachFiles: rest };
        });
      },
      startEditing: (chatId, messageId, text) => {
        set((state) => ({
          editing: { ...state.editing, [chatId]: { messageId, original: text, text } },
        }));
      },
      setEditingText: (chatId, text) => {
        set((state) => {
          const current = state.editing[chatId];
          if (!current) return state;
          return { editing: { ...state.editing, [chatId]: { ...current, text } } };
        });
      },
      cancelEditing: (chatId) => {
        set((state) => {
          const { [chatId]: _removed, ...rest } = state.editing;
          return { editing: rest };
        });
      },
    }),
    {
      name: CHAT_UI_STORAGE_KEY,
      partialize: (state) => ({ drafts: state.drafts }),
    },
  ),
);
