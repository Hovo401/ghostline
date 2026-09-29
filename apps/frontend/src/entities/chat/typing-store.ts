import { create } from "zustand";

/**
 * Who's typing, per chat — ephemeral push state (the `typing` WS event),
 * not a resource with a `GET` behind it, so it's a small Zustand store
 * rather than a Query cache entry. `use-typing-realtime.ts` is the only
 * writer; components read it with `useTypingStore`.
 */
interface TypingEntry {
  userId: string;
  at: number;
}

interface TypingState {
  byChat: Record<string, TypingEntry | undefined>;
  setTyping: (chatId: string, userId: string) => void;
  clearTyping: (chatId: string, userId: string) => void;
}

export const useTypingStore = create<TypingState>()((set) => ({
  byChat: {},
  setTyping: (chatId, userId) => {
    set((state) => ({ byChat: { ...state.byChat, [chatId]: { userId, at: Date.now() } } }));
  },
  clearTyping: (chatId, userId) => {
    set((state) => {
      const current = state.byChat[chatId];
      if (current?.userId !== userId) return state;
      const { [chatId]: _removed, ...rest } = state.byChat;
      return { byChat: rest };
    });
  },
}));
