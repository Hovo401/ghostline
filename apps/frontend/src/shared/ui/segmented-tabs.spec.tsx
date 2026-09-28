import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SegmentedTabs } from "./segmented-tabs";

describe("SegmentedTabs", () => {
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
});
