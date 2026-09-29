import { describe, expect, it, vi } from "vitest";

import { claimPlayback } from "./exclusive-playback";

function playingElement() {
  const element = document.createElement("audio");
  const pause = vi.fn();
  Object.defineProperty(element, "paused", { value: false, configurable: true });
  element.pause = pause;
  return { element, pause };
}

describe("claimPlayback", () => {
  it("pauses the element that held playback before", () => {
    const first = playingElement();
    const second = playingElement();
    claimPlayback(first.element);
    claimPlayback(second.element);
    expect(first.pause).toHaveBeenCalled();
    expect(second.pause).not.toHaveBeenCalled();
  });

  it("re-claiming by the same element doesn't pause it", () => {
    const { element, pause } = playingElement();
    claimPlayback(element);
    claimPlayback(element);
    expect(pause).not.toHaveBeenCalled();
  });
});
