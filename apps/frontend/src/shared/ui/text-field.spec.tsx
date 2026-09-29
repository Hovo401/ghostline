import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TextField } from "./text-field";

describe("TextField", () => {
  it("associates the label with the input", () => {
    render(<TextField label="Имя пользователя" name="username" hint="Латиница, цифры и _" />);
    const input = screen.getByLabelText("Имя пользователя");
    expect(input).toBeInTheDocument();
    expect(screen.getByText("Латиница, цифры и _")).toBeInTheDocument();
  });
});
