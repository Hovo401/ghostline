import { describe, expect, it } from "vitest";

import { AndroidReleaseSchema } from "./android-release.schema";

const valid = {
  versionCode: 12,
  versionName: "1.0.0",
  minVersionCode: 1,
  sha256: "a".repeat(64),
  url: "/downloads/android/ghostline-12.apk",
  changelog: "Первый релиз",
};

describe("AndroidReleaseSchema", () => {
  it("accepts a well-formed release", () => {
    expect(AndroidReleaseSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a malformed sha256", () => {
    expect(AndroidReleaseSchema.safeParse({ ...valid, sha256: "xyz" }).success).toBe(false);
  });

  it("rejects a non-integer versionCode", () => {
    expect(AndroidReleaseSchema.safeParse({ ...valid, versionCode: 1.5 }).success).toBe(false);
  });
});
