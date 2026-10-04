import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationsTab } from "./NotificationsTab";

const subscribe = vi.fn();
const unsubscribe = vi.fn();
const updateMutate = vi.fn();
let pushStatus: "subscribed" | "unsubscribed" | "denied" | "unsupported" | "pending" =
  "unsubscribed";
let settingsData: { messages: boolean; calls: boolean; preview: boolean } | undefined = {
  messages: true,
  calls: true,
  preview: true,
};

const sendTestPush = vi.fn();

vi.mock("../../entities/notification", () => ({
  NativePermissionChecklist: () => <div>checklist</div>,
  sendTestPush: () => sendTestPush() as Promise<void>,
  usePushSubscription: () => ({ status: pushStatus, subscribe, unsubscribe }),
  useNotificationSettings: () => ({ data: settingsData }),
  useUpdateNotificationSettings: () => ({ mutate: updateMutate }),
}));

// The install button asks the shared native layer for a published APK; no QueryClientProvider here.
let native = false;
let permissions: { notifications: boolean; unrestrictedBattery: boolean; oem: null } | null = null;
vi.mock("../../shared/native", () => ({
  isNativeApp: () => native,
  useLatestAndroidRelease: () => null,
  useNativePermissions: () => permissions,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NotificationsTab", () => {
  beforeEach(() => {
    pushStatus = "unsubscribed";
    native = false;
    permissions = null;
    settingsData = { messages: true, calls: true, preview: true };
  });

  describe("in the Android app", () => {
    beforeEach(() => {
      native = true;
    });

    it("says the app is connected, with no browser-style 'Отключить'", () => {
      pushStatus = "subscribed";
      render(<NotificationsTab />);
      expect(screen.getByText("Подключены (приложение)")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Отключить" })).not.toBeInTheDocument();
    });

    it("points to Android's settings when the permission is denied", () => {
      pushStatus = "denied";
      render(<NotificationsTab />);
      expect(screen.getByText("Запрещены в настройках Android")).toBeInTheDocument();
    });

    it("shows the call-readiness checklist when the app can report it", () => {
      permissions = { notifications: true, unrestrictedBattery: false, oem: null };
      render(<NotificationsTab />);
      expect(screen.getByText("Чтобы не пропускать звонки")).toBeInTheDocument();
      expect(screen.getByText("checklist")).toBeInTheDocument();
    });

    it("has no checklist in an app older than T-084", () => {
      render(<NotificationsTab />);
      expect(screen.queryByText("Чтобы не пропускать звонки")).not.toBeInTheDocument();
    });

    it("asks an outdated app (no plugin) to update", () => {
      pushStatus = "unsupported";
      render(<NotificationsTab />);
      expect(screen.getByText("Обновите приложение")).toBeInTheDocument();
    });
  });

  it("shows an 'Включить уведомления' button while unsubscribed", () => {
    render(<NotificationsTab />);
    fireEvent.click(screen.getByRole("button", { name: "Включить уведомления" }));
    expect(subscribe).toHaveBeenCalled();
  });

  it("shows 'Отключить' once subscribed", () => {
    pushStatus = "subscribed";
    render(<NotificationsTab />);
    fireEvent.click(screen.getByRole("button", { name: "Отключить" }));
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("toggles patch just their own field", () => {
    render(<NotificationsTab />);
    fireEvent.click(screen.getByRole("switch", { name: "Звонки" }));
    expect(updateMutate).toHaveBeenCalledWith({ calls: false });
  });

  it("disables the test button until subscribed", () => {
    render(<NotificationsTab />);
    expect(screen.getByRole("button", { name: "Отправить тестовое" })).toBeDisabled();
  });

  it("sends a real test push through the server once subscribed", async () => {
    pushStatus = "subscribed";
    sendTestPush.mockResolvedValue(undefined);
    render(<NotificationsTab />);
    fireEvent.click(screen.getByRole("button", { name: "Отправить тестовое" }));
    expect(sendTestPush).toHaveBeenCalled();
    expect(await screen.findByText("Отправлено")).toBeInTheDocument();
  });

  it("says so when the test push can't be sent", async () => {
    pushStatus = "subscribed";
    sendTestPush.mockRejectedValue(new Error("offline"));
    render(<NotificationsTab />);
    fireEvent.click(screen.getByRole("button", { name: "Отправить тестовое" }));
    expect(await screen.findByText("Не удалось отправить")).toBeInTheDocument();
  });

  it("reports the browser doesn't support push", () => {
    pushStatus = "unsupported";
    render(<NotificationsTab />);
    expect(screen.getByText("Не поддерживаются этим браузером")).toBeInTheDocument();
  });
});
