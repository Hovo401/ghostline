import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Dots } from "./dots";

describe("Dots", () => {
  it("renders three dots", () => {
    const { container } = render(<Dots />);
    expect(container.querySelectorAll("span > span")).toHaveLength(3);
  });
});
