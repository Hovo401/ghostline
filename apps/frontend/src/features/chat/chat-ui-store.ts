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

interface ChatUiState {
  selectedChatId: string | null;
  profilePanelOpen: boolean;
  newChatModalOpen: boolean;
  listFilter: string;
  drafts: Record<string, string>;
  selectChat: (chatId: string) => void;
  closeChat: () => void;
  openProfilePanel: () => void;
  closeProfilePanel: () => void;
  openNewChatModal: () => void;
  closeNewChatModal: () => void;
  setListFilter: (filter: string) => void;
  setDraft: (chatId: string, text: string) => void;
}

export const useChatUiStore = create<ChatUiState>()(
  persist(
    (set) => ({
      selectedChatId: null,
      profilePanelOpen: false,
      newChatModalOpen: false,
      listFilter: "",
      drafts: {},
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
    }),
    {
      name: CHAT_UI_STORAGE_KEY,
      partialize: (state) => ({ drafts: state.drafts }),
    },
  ),
);
