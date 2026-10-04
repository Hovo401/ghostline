import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAudioRoutes, setAudioRoute, resumeCall, addListener, hasGhostlinePlugin } = vi.hoisted(
  () => ({
    getAudioRoutes: vi.fn(),
    setAudioRoute: vi.fn(),
    resumeCall: vi.fn(),
    addListener: vi.fn(),
    hasGhostlinePlugin: vi.fn(),
  }),
);

vi.mock("./ghostline-plugin", () => ({
  Ghostline: { getAudioRoutes, setAudioRoute, resumeCall, addListener },
  hasGhostlinePlugin,
}));

import {
  getNativeAudioRoutes,
  listenForNativeAudioRoutes,
  listenForNativePipMode,
  resumeNativeCall,
  setNativeAudioRoute,
} from "./native-call";

const ROUTES = { current: "earpiece", available: [{ route: "earpiece", name: "Телефон" }] };

describe("native audio routes", () => {
  beforeEach(() => {
    hasGhostlinePlugin.mockReset().mockReturnValue(true);
    getAudioRoutes.mockReset().mockResolvedValue(ROUTES);
    setAudioRoute.mockReset().mockResolvedValue(undefined);
    addListener.mockReset();
  });

  it("reads the routes", async () => {
    expect(await getNativeAudioRoutes()).toEqual(ROUTES);
  });

  it("has no routes outside the app or in an APK without the method", async () => {
    hasGhostlinePlugin.mockReturnValue(false);
    expect(await getNativeAudioRoutes()).toBeNull();
    expect(getAudioRoutes).not.toHaveBeenCalled();

    hasGhostlinePlugin.mockReturnValue(true);
    getAudioRoutes.mockRejectedValue({ code: "UNIMPLEMENTED" });
    expect(await getNativeAudioRoutes()).toBeNull();
  });

  it("reports whether the switch happened", async () => {
    expect(await setNativeAudioRoute("speaker")).toBe(true);
    expect(setAudioRoute).toHaveBeenCalledWith({ route: "speaker" });

    setAudioRoute.mockRejectedValue({ code: "UNAVAILABLE" });
    expect(await setNativeAudioRoute("bluetooth")).toBe(false);

    hasGhostlinePlugin.mockReturnValue(false);
    expect(await setNativeAudioRoute("speaker")).toBe(false);
  });

  it("forwards route changes and unsubscribes", async () => {
    const remove = vi.fn();
    addListener.mockResolvedValue({ remove });
    const onRoutes = vi.fn();

    const off = listenForNativeAudioRoutes(onRoutes);
    expect(addListener).toHaveBeenCalledWith("audioRoutes", onRoutes);
    off();
    await vi.waitFor(() => {
      expect(remove).toHaveBeenCalled();
    });
  });

  it("unwraps the picture-in-picture flag", () => {
    addListener.mockResolvedValue({ remove: vi.fn() });
    const onChange = vi.fn();

    listenForNativePipMode(onChange);
    const [event, listener] = addListener.mock.calls[0] as [
      string,
      (e: { active: boolean }) => void,
    ];
    expect(event).toBe("pipModeChanged");
    listener({ active: true });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("listens to nothing outside the app", () => {
    hasGhostlinePlugin.mockReturnValue(false);
    listenForNativeAudioRoutes(vi.fn())();
    listenForNativePipMode(vi.fn())();
    expect(addListener).not.toHaveBeenCalled();
  });
});

describe("resumeNativeCall", () => {
  beforeEach(() => {
    hasGhostlinePlugin.mockReset().mockReturnValue(true);
    resumeCall.mockReset().mockResolvedValue(undefined);
  });

  it("asks native to resume and reports success", async () => {
    expect(await resumeNativeCall()).toBe(true);
    expect(resumeCall).toHaveBeenCalledTimes(1);
  });

  it("is false when nothing is on hold, in an old APK, or outside the app", async () => {
    resumeCall.mockRejectedValue({ code: "UNAVAILABLE" });
    expect(await resumeNativeCall()).toBe(false);
    resumeCall.mockRejectedValue({ code: "UNIMPLEMENTED" });
    expect(await resumeNativeCall()).toBe(false);

    hasGhostlinePlugin.mockReturnValue(false);
    resumeCall.mockClear();
    expect(await resumeNativeCall()).toBe(false);
    expect(resumeCall).not.toHaveBeenCalled();
  });
});
