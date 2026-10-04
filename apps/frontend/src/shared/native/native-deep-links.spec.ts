import { beforeEach, describe, expect, it, vi } from "vitest";

const { addListener, isNativeApp } = vi.hoisted(() => ({
  addListener: vi.fn(),
  isNativeApp: vi.fn(),
}));

vi.mock("@capacitor/app", () => ({ App: { addListener } }));
vi.mock("./is-native-app", () => ({ isNativeApp }));

import { listenForNativeLinks } from "./native-deep-links";

function openUrl(url: string): void {
  const handler = addListener.mock.calls[0]?.[1] as (event: { url: string }) => void;
  handler({ url });
}

describe("listenForNativeLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativeApp.mockReturnValue(true);
  });

  it("does nothing in a browser", () => {
    isNativeApp.mockReturnValue(false);
    listenForNativeLinks(vi.fn());
    expect(addListener).not.toHaveBeenCalled();
  });

  it("navigates to the path and query, whatever the host", () => {
    const navigate = vi.fn();
    listenForNativeLinks(navigate);
    openUrl("https://ghostline.diotek.pp.ua/app?chat=c1&call=k2#x");
    expect(navigate).toHaveBeenCalledWith("/app?chat=c1&call=k2#x");
  });
});
