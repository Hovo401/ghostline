import { EmojiPicker as Frimousse, type EmojiPickerListProps } from "frimousse";

import { useEmojiRecentStore } from "./emoji-recent-store";

/**
 * Emoji data comes from our own origin (`/emojibase/ru/*.json`, served by
 * `emojibase.plugin.ts`) rather than the picker's default CDN, so opening the
 * panel never sends a request to a third party.
 */
export const EMOJIBASE_URL = "/emojibase";
export const EMOJI_LOCALE = "ru";

const CELL = "flex h-11 w-full items-center justify-center rounded-lg text-2xl";

const LIST_COMPONENTS: NonNullable<EmojiPickerListProps["components"]> = {
  CategoryHeader: ({ category, ...props }) => (
    <div {...props} className="bg-panel px-2 pt-3 pb-1.5 text-xs font-medium text-mute">
      {category.label}
    </div>
  ),
  Row: ({ children, ...props }) => (
    <div
      {...props}
      className="grid grid-cols-[repeat(var(--frimousse-list-columns),minmax(0,1fr))] px-1"
    >
      {children}
    </div>
  ),
  Emoji: ({ emoji, ...props }) => (
    <button {...props} className={`${CELL} data-[active]:bg-bg2`}>
      {emoji.emoji}
    </button>
  ),
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  className?: string;
}

/**
 * Search + "Недавние" + the full virtualized emoji grid (FR-MSG-03, FR-MSG-13).
 * Every pick is also pushed to the shared recents, so it doesn't matter which
 * surface — composer or reaction menu — the emoji was chosen from.
 */
export function EmojiPicker({ onSelect, className }: EmojiPickerProps) {
  const recent = useEmojiRecentStore((state) => state.recent);
  const pushRecent = useEmojiRecentStore((state) => state.push);

  const select = (emoji: string): void => {
    pushRecent(emoji);
    onSelect(emoji);
  };

  return (
    <Frimousse.Root
      locale={EMOJI_LOCALE}
      emojibaseUrl={EMOJIBASE_URL}
      columns={8}
      onEmojiSelect={({ emoji }) => {
        select(emoji);
      }}
      className={["flex min-h-0 flex-col", className].filter(Boolean).join(" ")}
    >
      <div className="p-2">
        <Frimousse.Search
          aria-label="Поиск эмодзи"
          placeholder="Поиск"
          className="h-10 w-full rounded-full border border-line bg-bg2 px-4 text-[14.5px] text-fg outline-none focus-visible:border-accent-text"
        />
      </div>
      {recent.length > 0 && (
        <div role="group" aria-label="Недавние" className="border-b border-line px-1 pb-1">
          <div className="grid grid-cols-8">
            {recent.slice(0, 8).map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  select(emoji);
                }}
                className={`${CELL} hover:bg-bg2`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
      <Frimousse.Viewport className="min-h-0 flex-1">
        <Frimousse.Loading>
          <span className="block p-6 text-center text-sm text-mute">Загрузка…</span>
        </Frimousse.Loading>
        <Frimousse.Empty>
          <span className="block p-6 text-center text-sm text-mute">Ничего не найдено</span>
        </Frimousse.Empty>
        <Frimousse.List components={LIST_COMPONENTS} />
      </Frimousse.Viewport>
    </Frimousse.Root>
  );
}
