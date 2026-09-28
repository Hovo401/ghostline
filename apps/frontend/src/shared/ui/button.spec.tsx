import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders its label and calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Отправить</Button>);

    const button = screen.getByRole("button", { name: "Отправить" });
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies the secondary variant class", () => {
    render(<Button variant="secondary">Отмена</Button>);
    expect(screen.getByRole("button", { name: "Отмена" }).className).toContain("border-line");
  });
});
