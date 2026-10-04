import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SegmentedTabs } from "./segmented-tabs";

describe("SegmentedTabs", () => {
  afterEach(() => {
    cleanup();
  });

  it("marks the active tab and calls onChange for the clicked one", () => {
    const onChange = vi.fn();
    render(
      <SegmentedTabs
        options={[
          { value: "login", label: "Вход" },
          { value: "register", label: "Регистрация" },
        ]}
        value="login"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("tab", { name: "Вход" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));
    expect(onChange).toHaveBeenCalledWith("register");
  });

  it("stretches to fill width with flex-1 segments when fill is set", () => {
    render(
      <SegmentedTabs
        options={[
          { value: "profile", label: "Профиль" },
          { value: "appearance", label: "Внешний вид" },
        ]}
        value="profile"
        onChange={vi.fn()}
        fill
      />,
    );

    expect(screen.getByRole("tablist")).toHaveClass("w-full");
    expect(screen.getByRole("tab", { name: "Внешний вид" })).toHaveClass("flex-1");
  });

  it("lets a long single-word label wrap inside its segment when fill is set", () => {
    render(
      <SegmentedTabs
        options={[{ value: "notifications", label: "Уведомления" }]}
        value="notifications"
        onChange={vi.fn()}
        fill
      />,
    );

    // Regression: on a ~360px phone "Уведомления" spilled past the border.
    expect(screen.getByRole("tab", { name: "Уведомления" })).toHaveClass(
      "min-w-0",
      "wrap-break-word",
      "hyphens-auto",
    );
  });
});
