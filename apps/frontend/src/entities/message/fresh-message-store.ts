import { create } from "zustand";

interface FreshMessageState {
  /** Ids of media messages that arrived over the socket this session —
   * the "new message" half of the media auto-download policy
   * (entities/attachment/auto-download-policy.ts). In memory only: after a
   * reload they're history like everything else. */
  ids: Record<string, true>;
  mark: (messageId: string) => void;
}

export const useFreshMessageStore = create<FreshMessageState>((set) => ({
  ids: {},
  mark: (messageId) => {
    set((state) => ({ ids: { ...state.ids, [messageId]: true } }));
  },
}));
