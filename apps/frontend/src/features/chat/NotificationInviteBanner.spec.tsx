import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useNotificationBannerStore,
  type PushSubscriptionStatus,
} from "../../entities/notification";
import type * as NotificationEntity from "../../entities/notification";

import { NotificationInviteBanner } from "./NotificationInviteBanner";

const usePushSubscriptionMock = vi.fn<() => { status: PushSubscriptionStatus }>();
vi.mock("../../entities/notification", async (importOriginal) => {
  const actual = await importOriginal<typeof NotificationEntity>();
  return { ...actual, usePushSubscription: () => usePushSubscriptionMock() };
});

function renderBanner() {
  const rootRoute = createRootRoute({ component: NotificationInviteBanner });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/app"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("NotificationInviteBanner", () => {
  beforeEach(() => {
    useNotificationBannerStore.setState({ dismissed: false });
    usePushSubscriptionMock.mockReturnValue({ status: "unsubscribed" });
  });

  afterEach(cleanup);

  it("renders nothing once already subscribed", () => {
    usePushSubscriptionMock.mockReturnValue({ status: "subscribed" });
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing once dismissed", () => {
    useNotificationBannerStore.getState().dismiss();
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the invite while unsubscribed and not dismissed", async () => {
    renderBanner();
    expect(
      await screen.findByText("Включить уведомления о сообщениях и звонках?"),
    ).toBeInTheDocument();
  });

  it("dismissing it persists and hides it", async () => {
    renderBanner();
    fireEvent.click(await screen.findByLabelText("Скрыть"));
    expect(useNotificationBannerStore.getState().dismissed).toBe(true);
  });
});
