import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useAppearanceStore } from "../../shared/theme/appearance-store";

import { Route } from "./ui";

// Renders the whole /dev/ui showcase (every theme × every primitive) in
// jsdom, dark and light, as a cheap crash smoke test — DESIGN-BRIEF.md
// §11 DR-01. Not a substitute for eyeballing it in a real browser (WebGL
// isn't in jsdom, so ghost-field's `setup()` throws and is swallowed —
// see ghost-field-element.ts), but catches "themes I forgot to register"
// or "component blew up" regressions without one.
const component = Route.options.component;
if (!component) throw new Error("dev/ui route has no component");
const Component = component;

// Renders, lets one macrotask flush (so React's scheduler and any pending
// rAF work settle inside this test's jsdom environment, not after
// teardown), then unmounts — cancelling Scramble's animation frame loop
// and ghost-field's font-load timer before the test ends.
async function renderAndSettle() {
  const view = render(<Component />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

describe("/dev/ui", () => {
  afterEach(() => {
    cleanup();
    useAppearanceStore.setState({ theme: "dark" });
  });

  it("renders in the dark theme without throwing", async () => {
    act(() => {
      useAppearanceStore.setState({ theme: "dark" });
    });
    await expect(renderAndSettle()).resolves.toBeTruthy();
  });

  it("renders in the light theme without throwing", async () => {
    act(() => {
      useAppearanceStore.setState({ theme: "light" });
    });
    await expect(renderAndSettle()).resolves.toBeTruthy();
  });
});
