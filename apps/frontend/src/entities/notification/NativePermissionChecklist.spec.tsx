import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NativePermissionStatus } from "../../shared/native";

const { openSystemSettings, subscribe, sendTestPush } = vi.hoisted(() => ({
  openSystemSettings: vi.fn(),
  subscribe: vi.fn(),
  sendTestPush: vi.fn(),
}));
let pushStatus = "unsubscribed";

vi.mock("../../shared/native", () => ({
  NATIVE_PERMISSIONS_KEY: ["native-permissions"],
  openSystemSettings,
}));
vi.mock("./use-push-subscription", () => ({
  usePushSubscription: () => ({ status: pushStatus, subscribe }),
  sendTestPush: (kind?: string) => sendTestPush(kind) as Promise<void>,
}));

import { isNativeSetupComplete } from "./native-setup";
import { NativePermissionChecklist } from "./NativePermissionChecklist";

const OK: NativePermissionStatus = {
  notifications: true,
  fullScreenCalls: true,
  unrestrictedBattery: true,
  oem: null,
};

function renderChecklist(status: NativePermissionStatus) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NativePermissionChecklist status={status} />
    </QueryClientProvider>,
  );
}

describe("NativePermissionChecklist", () => {
  beforeEach(() => {
    pushStatus = "unsubscribed";
    openSystemSettings.mockReset().mockResolvedValue(true);
    subscribe.mockReset().mockResolvedValue(undefined);
    sendTestPush.mockReset().mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it("sends a call-kind test push and tells the user to lock the screen", async () => {
    renderChecklist(OK);
    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));
    expect(sendTestPush).toHaveBeenCalledWith("call");
    expect(
      await screen.findByText("Заблокируйте экран — через 5 секунд придёт тестовый звонок"),
    ).toBeInTheDocument();
  });

  it("says so when the test call push can't be sent", async () => {
    sendTestPush.mockRejectedValue(new Error("offline"));
    renderChecklist(OK);
    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));
    expect(await screen.findByText("Не удалось отправить")).toBeInTheDocument();
  });

  it("offers no action for rows that are fine, besides the always-on call test", () => {
    renderChecklist(OK);
    expect(screen.getByRole("button", { name: "Проверить" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("asks Android for the notification permission first", async () => {
    renderChecklist({ ...OK, notifications: false });
    fireEvent.click(screen.getByRole("button", { name: "Включить" }));
    await waitFor(() => {
      expect(subscribe).toHaveBeenCalledOnce();
    });
    expect(openSystemSettings).not.toHaveBeenCalled();
  });

  it("opens Android's settings once the permission was refused", () => {
    pushStatus = "denied";
    renderChecklist({ ...OK, notifications: false });
    fireEvent.click(screen.getByRole("button", { name: "Открыть настройки" }));
    expect(openSystemSettings).toHaveBeenCalledWith("notifications");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("opens the full-screen and battery screens", () => {
    renderChecklist({ ...OK, fullScreenCalls: false, unrestrictedBattery: false });
    for (const button of screen.getAllByRole("button", { name: "Разрешить" })) {
      fireEvent.click(button);
    }
    expect(openSystemSettings).toHaveBeenNthCalledWith(1, "fullScreenCalls");
    expect(openSystemSettings).toHaveBeenNthCalledWith(2, "battery");
  });

  it("hides the full-screen row where the setting doesn't exist (before Android 14)", () => {
    renderChecklist({ ...OK, fullScreenCalls: undefined });
    expect(screen.queryByText("Звонки на весь экран")).not.toBeInTheDocument();
  });

  it("shows the autostart row, with a hint, only on OEMs that have one", () => {
    const { unmount } = renderChecklist(OK);
    expect(screen.queryByText("Автозапуск")).not.toBeInTheDocument();
    unmount();

    renderChecklist({ ...OK, oem: "xiaomi" });
    expect(screen.getByText("Автозапуск")).toBeInTheDocument();
    expect(screen.getByText(/Безопасность → Разрешения/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Открыть" }));
    expect(openSystemSettings).toHaveBeenCalledWith("autostart");
  });
});

describe("isNativeSetupComplete", () => {
  it("is true when everything verifiable is on", () => {
    expect(isNativeSetupComplete(OK)).toBe(true);
    expect(isNativeSetupComplete({ ...OK, fullScreenCalls: undefined, oem: "xiaomi" })).toBe(true);
  });

  it("is false when any verifiable row is off", () => {
    expect(isNativeSetupComplete({ ...OK, notifications: false })).toBe(false);
    expect(isNativeSetupComplete({ ...OK, fullScreenCalls: false })).toBe(false);
    expect(isNativeSetupComplete({ ...OK, unrestrictedBattery: false })).toBe(false);
  });
});
