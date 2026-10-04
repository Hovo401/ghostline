import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AndroidUpdate } from "../../shared/native";

import { AppUpdateBanner } from "./AppUpdateBanner";

let update: AndroidUpdate = { status: "none" };
vi.mock("../../shared/native", () => ({ useAndroidUpdate: () => update }));

const release = {
  versionCode: 5,
  versionName: "1.2.0",
  minVersionCode: 1,
  sha256: "a".repeat(64),
  url: "/downloads/android/ghostline-5.apk",
  changelog: "",
};

describe("AppUpdateBanner", () => {
  afterEach(cleanup);

  it("renders nothing when up to date", () => {
    update = { status: "none" };
    const { container } = render(<AppUpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the APK and can be dismissed when optional", () => {
    update = { status: "available", release };
    const { container } = render(<AppUpdateBanner />);
    expect(screen.getByRole("link", { name: "Обновить" })).toHaveAttribute("href", release.url);
    fireEvent.click(screen.getByLabelText("Скрыть предложение обновить"));
    expect(container).toBeEmptyDOMElement();
  });

  it("can't be dismissed when the update is required", () => {
    update = { status: "required", release };
    render(<AppUpdateBanner />);
    expect(screen.queryByLabelText("Скрыть предложение обновить")).toBeNull();
  });
});
