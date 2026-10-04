import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NativeAudioRoutes } from "../../shared/native";

import { AudioRouteSheet } from "./AudioRouteSheet";

const routes: NativeAudioRoutes = {
  current: "bluetooth",
  available: [
    { route: "earpiece", name: "Phone" },
    { route: "speaker", name: "Speaker" },
    { route: "bluetooth", name: "Galaxy Buds" },
    { route: "wired", name: "USB headset" },
  ],
};

describe("AudioRouteSheet", () => {
  afterEach(cleanup);

  it("lists every available route as a radio item and marks the current one", () => {
    render(<AudioRouteSheet routes={routes} onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Телефон"),
      expect.stringContaining("Динамик"),
      expect.stringContaining("Bluetooth"),
      expect.stringContaining("Наушники"),
    ]);
    expect(screen.getByRole("menuitemradio", { name: /Bluetooth/ })).toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: /Динамик/ })).not.toBeChecked();
    expect(screen.getByText("Galaxy Buds")).toBeInTheDocument();
  });

  it("offers only the routes that are available", () => {
    render(
      <AudioRouteSheet
        routes={{ current: "speaker", available: routes.available.slice(0, 2) }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(2);
  });

  it("reports the chosen route", () => {
    const onSelect = vi.fn();
    render(<AudioRouteSheet routes={routes} onSelect={onSelect} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Наушники/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("wired");
  });

  it("closes from the backdrop and Escape", () => {
    const onClose = vi.fn();
    render(<AudioRouteSheet routes={routes} onSelect={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("backdrop"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
