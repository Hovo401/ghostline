import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Rail } from "./rail";

describe("Rail", () => {
  it("renders the logo mark plus given items and footer", () => {
    render(<Rail items={<span>Чаты</span>} footer={<span>Я</span>} />);
    expect(screen.getByText("g")).toBeInTheDocument();
    expect(screen.getByText("Чаты")).toBeInTheDocument();
    expect(screen.getByText("Я")).toBeInTheDocument();
  });
});
