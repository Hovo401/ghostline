import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Avatar } from "./avatar";

describe("Avatar", () => {
  it("falls back to initials when there's no image", () => {
    render(<Avatar name="Алексей Громов" />);
    expect(screen.getByText("АГ")).toBeInTheDocument();
  });

  it("exposes online state for assistive tech", () => {
    render(<Avatar name="Олег" online />);
    expect(screen.getByRole("status", { name: "в сети" })).toBeInTheDocument();
  });
});
