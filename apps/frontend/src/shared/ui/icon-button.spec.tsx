import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IconButton } from "./icon-button";

describe("IconButton", () => {
  it("exposes an accessible name and handles clicks", () => {
    const onClick = vi.fn();
    render(<IconButton icon={<span>{"↑"}</span>} label="Отправить" onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Отправить" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
