import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useInAppBack } from "../../shared/lib/use-in-app-back";

import { useOpenChat, useSelectedChatId } from "./use-chat-navigation";

function Probe() {
  const selected = useSelectedChatId();
  const openChat = useOpenChat();
  const closeChat = useInAppBack();
  return (
    <>
      <p>selected: {selected ?? "none"}</p>
      <button
        type="button"
        onClick={() => {
          openChat("c1");
        }}
      >
        open c1
      </button>
      <button
        type="button"
        onClick={() => {
          openChat("c2");
        }}
      >
        open c2
      </button>
      <button type="button" onClick={closeChat}>
        close
      </button>
    </>
  );
}

async function renderAt(initialEntries: string[]) {
  const rootRoute = createRootRoute();
  const landingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <p>landing</p>,
  });
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/app",
    component: Probe,
    validateSearch: (search: Record<string, unknown>) => search,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([landingRoute, appRoute]),
    history: createMemoryHistory({ initialEntries, initialIndex: initialEntries.length - 1 }),
  });
  render(<RouterProvider router={router} />);
  await settle();
  return router.history;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function click(name: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name }));
  await settle();
}

describe("chat navigation", () => {
  afterEach(cleanup);

  it("opening from the list pushes, and closing steps back to the list — not out of the app", async () => {
    const history = await renderAt(["/", "/app"]);
    const listIndex = history.location.state.__TSR_index;

    await click("open c1");
    expect(screen.getByText("selected: c1")).toBeInTheDocument();
    expect(history.location.state.__TSR_index).toBe(listIndex + 1);

    await click("close");
    expect(screen.getByText("selected: none")).toBeInTheDocument();
    expect(history.location.pathname).toBe("/app");
    expect(history.location.state.__TSR_index).toBe(listIndex);
  });

  it("system Back from an open chat lands on the list", async () => {
    const history = await renderAt(["/", "/app"]);

    await click("open c1");
    history.back();
    await settle();

    expect(history.location.pathname).toBe("/app");
    expect(screen.getByText("selected: none")).toBeInTheDocument();
  });

  it("switching chats replaces, so Back from any chat is one step to the list", async () => {
    const history = await renderAt(["/", "/app"]);
    const listIndex = history.location.state.__TSR_index;

    await click("open c1");
    await click("open c2");
    expect(screen.getByText("selected: c2")).toBeInTheDocument();
    expect(history.location.state.__TSR_index).toBe(listIndex + 1);

    await click("close");
    expect(history.location.state.__TSR_index).toBe(listIndex);
    expect(screen.getByText("selected: none")).toBeInTheDocument();
  });

  it("closing a chat landed on directly (deep link) replaces with the list", async () => {
    const history = await renderAt(["/", "/app?chat=c1"]);
    const index = history.location.state.__TSR_index;

    await click("close");

    expect(history.location.href).toBe("/app");
    expect(history.location.state.__TSR_index).toBe(index);
  });

  it("opening a chat over an overlay entry replaces that entry", async () => {
    const history = await renderAt(["/", "/app"]);
    history.push("/app", { glOverlay: "overlay-x" });
    await settle();
    const overlayIndex = history.location.state.__TSR_index;

    await click("open c1");

    expect(history.location.state.__TSR_index).toBe(overlayIndex);
    expect(history.location.state.glOverlay).toBeUndefined();
    await click("close");
    expect(history.location.state.__TSR_index).toBe(overlayIndex - 1);
    expect(screen.getByText("selected: none")).toBeInTheDocument();
  });
});
