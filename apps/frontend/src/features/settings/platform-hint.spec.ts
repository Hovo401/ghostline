import { describe, expect, it } from "vitest";

import { detectPlatformHint } from "./platform-hint";

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

describe("detectPlatformHint", () => {
  it("suggests adding to the Home Screen on iOS Safari when not installed", () => {
    const hint = detectPlatformHint(IOS_UA, false);
    expect(hint?.kind).toBe("ios");
    expect(hint?.text).toContain("экран «Домой»");
  });

  it("says nothing on iOS once already running standalone", () => {
    expect(detectPlatformHint(IOS_UA, true)).toBeNull();
  });

  it("suggests installing and allowing background work on Android", () => {
    const hint = detectPlatformHint(ANDROID_UA, false);
    expect(hint?.kind).toBe("android");
    expect(hint?.text).toContain("фоновую работу");
  });

  it("suggests enabling background apps on desktop Chrome/Edge", () => {
    const hint = detectPlatformHint(DESKTOP_CHROME_UA, false);
    expect(hint?.kind).toBe("desktop");
    expect(hint?.text).toContain("фоновую работу приложений");
  });

  it("says nothing for an unrecognized platform", () => {
    expect(
      detectPlatformHint("Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/120.0", false),
    ).toBeNull();
  });
});
