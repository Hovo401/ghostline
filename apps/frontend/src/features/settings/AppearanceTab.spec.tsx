import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAppearanceStore } from "../../shared/theme/appearance-store";

import { AppearanceTab } from "./AppearanceTab";

const DEFAULT_STATE = useAppearanceStore.getState();

describe("AppearanceTab", () => {
  beforeEach(() => {
    useAppearanceStore.setState(DEFAULT_STATE, true);
  });

  afterEach(() => {
    cleanup();
    useAppearanceStore.setState(DEFAULT_STATE, true);
  });

  it("renders the live preview bubble", () => {
    render(<AppearanceTab />);
    expect(screen.getByText("Встречаемся у библиотеки в семь?")).toBeInTheDocument();
  });

  it("picking a theme card writes to the appearance store", () => {
    render(<AppearanceTab />);

    fireEvent.click(screen.getByRole("button", { name: /Полночь/ }));

    expect(useAppearanceStore.getState().theme).toBe("midnight");
  });

  it("picking an accent writes to the appearance store", () => {
    render(<AppearanceTab />);

    fireEvent.click(screen.getByRole("button", { name: "Ион" }));

    expect(useAppearanceStore.getState().accent).toBe("ion");
  });

  it("only shows the custom theme color pickers once 'Своя' is selected", () => {
    render(<AppearanceTab />);
    expect(screen.queryByText("Фон")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Своя/ }));

    expect(screen.getByText("Фон")).toBeInTheDocument();
  });

  it("toggles the decrypt animation switch", () => {
    render(<AppearanceTab />);
    expect(useAppearanceStore.getState().decrypt).toBe(true);

    fireEvent.click(screen.getByRole("switch", { name: "Анимация появления" }));

    expect(useAppearanceStore.getState().decrypt).toBe(false);
  });
});
