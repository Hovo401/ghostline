import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NativePermissionStatus } from "../../shared/native";

let permissions: NativePermissionStatus | null | undefined;
const markSetupSeen = vi.fn();
let setupSeen = false;

vi.mock("../../shared/native", () => ({ useNativePermissions: () => permissions }));
vi.mock("../../entities/notification", () => ({
  isNativeSetupComplete: (s: NativePermissionStatus) => s.notifications && s.unrestrictedBattery,
  NativePermissionChecklist: () => <div>checklist</div>,
  useNotificationBannerStore: (select: (state: unknown) => unknown) =>
    select({ setupSeen, markSetupSeen }),
}));
vi.mock("./NotificationPrompt", () => ({ NotificationPrompt: () => <div>plain prompt</div> }));

import { CallSetupScreen } from "./CallSetupScreen";

const OFF: NativePermissionStatus = { notifications: false, unrestrictedBattery: false, oem: null };

describe("CallSetupScreen", () => {
  beforeEach(() => {
    setupSeen = false;
    permissions = OFF;
    markSetupSeen.mockClear();
  });
  afterEach(cleanup);

  it("lists what is still off on the first run", () => {
    render(<CallSetupScreen />);
    expect(screen.getByRole("dialog", { name: "Чтобы не пропускать звонки" })).toBeInTheDocument();
    expect(screen.getByText("checklist")).toBeInTheDocument();
    expect(screen.queryByText("plain prompt")).not.toBeInTheDocument();
  });

  it("is remembered once closed", () => {
    render(<CallSetupScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    expect(markSetupSeen).toHaveBeenCalledOnce();
  });

  it("doesn't come back after it was seen", () => {
    setupSeen = true;
    const { container } = render(<CallSetupScreen />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays away from a phone that is already set up", () => {
    permissions = { notifications: true, unrestrictedBattery: true, oem: null };
    const { container } = render(<CallSetupScreen />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing while the status loads, not the plain prompt", () => {
    permissions = undefined;
    const { container } = render(<CallSetupScreen />);
    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to the plain prompt in an APK without the checklist", () => {
    permissions = null;
    render(<CallSetupScreen />);
    expect(screen.getByText("plain prompt")).toBeInTheDocument();
  });
});
