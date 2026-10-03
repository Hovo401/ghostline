import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useBackToClose } from "./use-back-to-close";

function Overlay({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  useBackToClose(open, () => {
    setOpen(false);
  });
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        open {name}
      </button>
      {open && (
        <button
          type="button"
          onClick={() => {
            setOpen(false);
          }}
        >
          close {name}
        </button>
      )}
    </div>
  );
}

function Screen() {
  return (
    <>
      <Overlay name="a" />
      <Overlay name="b" />
    </>
  );
}

async function renderScreen() {
  const router = createRouter({
    routeTree: createRootRoute({ component: Screen }),
    history: createMemoryHistory({ initialEntries: ["/app?chat=c1"] }),
  });
  render(<RouterProvider router={router} />);
  await act(async () => {
    await Promise.resolve();
  });
  return router.history;
}

async function click(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
  });
}

async function back(history: { back: () => void }): Promise<void> {
  await act(async () => {
    history.back();
    await Promise.resolve();
  });
}

describe("useBackToClose", () => {
  afterEach(cleanup);

  it("opening pushes a same-URL entry that Back pops to close it", async () => {
    const history = await renderScreen();
    const start = history.location.state.__TSR_index;

    await click("open a");
    expect(history.location.state.__TSR_index).toBe(start + 1);
    expect(history.location.href).toBe("/app?chat=c1");

    await back(history);
    expect(screen.queryByRole("button", { name: "close a" })).not.toBeInTheDocument();
    expect(history.location.state.__TSR_index).toBe(start);
  });

  it("closing from the UI pops its own entry instead of leaving a dead step", async () => {
    const history = await renderScreen();
    const start = history.location.state.__TSR_index;

    await click("open a");
    await click("close a");

    expect(history.location.state.__TSR_index).toBe(start);
    expect(history.location.state.glOverlay).toBeUndefined();
  });

  it("peels stacked overlays off one Back at a time", async () => {
    const history = await renderScreen();

    await click("open a");
    await click("open b");

    await back(history);
    expect(screen.queryByRole("button", { name: "close b" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "close a" })).toBeInTheDocument();

    await back(history);
    expect(screen.queryByRole("button", { name: "close a" })).not.toBeInTheDocument();
  });

  it("closes when a navigation replaces its entry, without stepping back", async () => {
    const history = await renderScreen();
    const start = history.location.state.__TSR_index;

    await click("open a");
    await act(async () => {
      history.replace("/app?chat=c2");
      await Promise.resolve();
    });

    expect(screen.queryByRole("button", { name: "close a" })).not.toBeInTheDocument();
    expect(history.location.href).toBe("/app?chat=c2");
    expect(history.location.state.__TSR_index).toBe(start + 1);
  });
});
