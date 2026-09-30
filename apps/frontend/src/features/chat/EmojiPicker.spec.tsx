import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEmojiRecentStore } from "./emoji-recent-store";
import { EmojiPicker } from "./EmojiPicker";

// frimousse needs layout (ResizeObserver, virtualization) that jsdom lacks — the
// grid itself is the library's job; this spec covers what we wire around it.
let rootProps: {
  locale?: string;
  emojibaseUrl?: string;
  onEmojiSelect?: (e: { emoji: string }) => void;
} = {};
vi.mock("frimousse", () => ({
  EmojiPicker: {
    Root: (props: { children: ReactNode } & typeof rootProps) => {
      rootProps = props;
      return <div>{props.children}</div>;
    },
    Search: (props: ComponentProps<"input">) => <input {...props} />,
    Viewport: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Loading: () => null,
    Empty: () => null,
    List: () => null,
  },
}));

beforeEach(() => {
  useEmojiRecentStore.setState({ recent: [] });
  rootProps = {};
});

afterEach(() => {
  cleanup();
});

describe("EmojiPicker", () => {
  it("loads Russian emoji data from our own origin, not a third-party CDN", () => {
    render(<EmojiPicker onSelect={vi.fn()} />);

    expect(rootProps.locale).toBe("ru");
    expect(rootProps.emojibaseUrl).toBe("/emojibase");
  });

  it("reports a grid pick and remembers it as recent", () => {
    const onSelect = vi.fn();
    render(<EmojiPicker onSelect={onSelect} />);

    rootProps.onEmojiSelect?.({ emoji: "🎉" });

    expect(onSelect).toHaveBeenCalledWith("🎉");
    expect(useEmojiRecentStore.getState().recent).toEqual(["🎉"]);
  });

  it("hides the recents row until something was picked", () => {
    render(<EmojiPicker onSelect={vi.fn()} />);

    expect(screen.queryByRole("group", { name: "Недавние" })).not.toBeInTheDocument();
  });

  it("shows recents and moves a re-picked one to the front", () => {
    useEmojiRecentStore.setState({ recent: ["🔥", "🎉"] });
    const onSelect = vi.fn();
    render(<EmojiPicker onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "🎉" }));

    expect(onSelect).toHaveBeenCalledWith("🎉");
    expect(useEmojiRecentStore.getState().recent).toEqual(["🎉", "🔥"]);
  });
});
