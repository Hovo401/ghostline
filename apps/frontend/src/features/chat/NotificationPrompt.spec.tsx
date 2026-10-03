import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useNotificationBannerStore,
  type PushSubscriptionStatus,
} from "../../entities/notification";
import type * as NotificationEntity from "../../entities/notification";

import { NotificationPrompt } from "./NotificationPrompt";

const subscribeMock = vi.fn();
const usePushSubscriptionMock = vi.fn<() => { status: PushSubscriptionStatus }>();
vi.mock("../../entities/notification", async (importOriginal) => {
  const actual = await importOriginal<typeof NotificationEntity>();
  return {
    ...actual,
    usePushSubscription: () => ({ ...usePushSubscriptionMock(), subscribe: subscribeMock }),
  };
});

describe("NotificationPrompt", () => {
  beforeEach(() => {
    subscribeMock.mockReset().mockResolvedValue(undefined);
    useNotificationBannerStore.setState({ promptSeen: false, dismissed: false });
    usePushSubscriptionMock.mockReturnValue({ status: "unsubscribed" });
  });

  afterEach(cleanup);

  it("asks on the first open while notifications are off", () => {
    render(<NotificationPrompt />);
    expect(screen.getByRole("dialog", { name: "Уведомления" })).toBeInTheDocument();
  });

  it("«Разрешить» requests the browser permission and doesn't ask again", () => {
    render(<NotificationPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Разрешить" }));

    expect(subscribeMock).toHaveBeenCalledOnce();
    expect(useNotificationBannerStore.getState().promptSeen).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«Не сейчас» closes it without the browser prompt — the chat banner takes over", () => {
    render(<NotificationPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Не сейчас" }));

    expect(subscribeMock).not.toHaveBeenCalled();
    expect(useNotificationBannerStore.getState().promptSeen).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each<PushSubscriptionStatus>(["subscribed", "denied", "unsupported", "pending"])(
    "stays hidden while status is %s",
    (status) => {
      usePushSubscriptionMock.mockReturnValue({ status });
      const { container } = render(<NotificationPrompt />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it("stays hidden once answered", () => {
    useNotificationBannerStore.setState({ promptSeen: true });
    const { container } = render(<NotificationPrompt />);
    expect(container).toBeEmptyDOMElement();
  });
});
