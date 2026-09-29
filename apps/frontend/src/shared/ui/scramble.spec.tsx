import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Scramble } from "./scramble";

describe("Scramble", () => {
  it("renders the final text instantly when instant is set", () => {
    render(<Scramble text="ghostline" instant />);
    expect(screen.getByText("ghostline")).toBeInTheDocument();
  });
});
