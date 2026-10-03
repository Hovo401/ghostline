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

const subscribeMock = vi.fn();
const usePushSubscriptionMock = vi.fn<() => { status: PushSubscriptionStatus }>();
vi.mock("../../entities/notification", async (importOriginal) => {
  const actual = await importOriginal<typeof NotificationEntity>();
  return {
    ...actual,
    usePushSubscription: () => ({ ...usePushSubscriptionMock(), subscribe: subscribeMock }),
  };
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
    subscribeMock.mockReset();
    useNotificationBannerStore.setState({ promptSeen: true, dismissed: false });
    usePushSubscriptionMock.mockReturnValue({ status: "unsubscribed" });
  });

  afterEach(cleanup);

  it("stays hidden until the first-open prompt was answered", () => {
    useNotificationBannerStore.setState({ promptSeen: false });
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

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

  it("«Включить» asks for permission right here instead of detouring to settings", async () => {
    renderBanner();
    expect(
      await screen.findByText("Включить уведомления о сообщениях и звонках?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Включить" }));

    expect(subscribeMock).toHaveBeenCalledOnce();
  });

  it("when blocked in the browser, links to the notifications section of settings", async () => {
    usePushSubscriptionMock.mockReturnValue({ status: "denied" });
    renderBanner();

    const link = await screen.findByRole("link", { name: "Как включить" });
    expect(link).toHaveAttribute("href", "/app/settings?tab=notifications");
  });

  it("dismissing it persists and hides it", async () => {
    renderBanner();
    fireEvent.click(await screen.findByLabelText("Скрыть"));
    expect(useNotificationBannerStore.getState().dismissed).toBe(true);
  });
});
