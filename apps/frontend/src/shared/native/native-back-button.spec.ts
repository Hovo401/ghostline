import { beforeEach, describe, expect, it, vi } from "vitest";

const { addListener, minimizeApp, isNativeApp } = vi.hoisted(() => ({
  addListener: vi.fn(),
  minimizeApp: vi.fn(),
  isNativeApp: vi.fn(),
}));

vi.mock("@capacitor/app", () => ({ App: { addListener, minimizeApp } }));
vi.mock("./is-native-app", () => ({ isNativeApp }));

import { listenForNativeBack } from "./native-back-button";

function pressBack(canGoBack: boolean): void {
  const handler = addListener.mock.calls[0]?.[1] as (event: { canGoBack: boolean }) => void;
  handler({ canGoBack });
}

describe("listenForNativeBack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativeApp.mockReturnValue(true);
  });

  it("does nothing in a browser", () => {
    isNativeApp.mockReturnValue(false);
    listenForNativeBack();
    expect(addListener).not.toHaveBeenCalled();
  });

  it("goes back in history when there is history", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    listenForNativeBack();
    pressBack(true);
    expect(back).toHaveBeenCalledOnce();
    expect(minimizeApp).not.toHaveBeenCalled();
  });

  it("minimizes the app at the root of the history", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    listenForNativeBack();
    pressBack(false);
    expect(minimizeApp).toHaveBeenCalledOnce();
    expect(back).not.toHaveBeenCalled();
  });
});
