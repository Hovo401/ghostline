import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_RECENT = 24;

export const EMOJI_RECENT_STORAGE_KEY = "gl-emoji-recent";

interface EmojiRecentState {
  /** Most recent first — shared by the composer picker and the reaction picker. */
  recent: string[];
  push: (emoji: string) => void;
}

/** FR-MSG-03: frimousse doesn't track usage, so "Недавние" lives here, per device. */
export const useEmojiRecentStore = create<EmojiRecentState>()(
  persist(
    (set) => ({
      recent: [],
      push: (emoji) => {
        set((state) => ({
          recent: [emoji, ...state.recent.filter((item) => item !== emoji)].slice(0, MAX_RECENT),
        }));
      },
    }),
    { name: EMOJI_RECENT_STORAGE_KEY },
  ),
);
