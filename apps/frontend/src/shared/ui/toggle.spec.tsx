import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Toggle } from "./toggle";

describe("Toggle", () => {
  it("renders as a switch and reports the flipped state on click", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Без звука" />);

    const el = screen.getByRole("switch", { name: "Без звука" });
    expect(el).toHaveAttribute("aria-checked", "false");

    fireEvent.click(el);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
