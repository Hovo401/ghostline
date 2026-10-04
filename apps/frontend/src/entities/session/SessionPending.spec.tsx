import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useSessionStore } from "../../shared/api/session-store";

import { SessionPending } from "./SessionPending";

const TEXT = "Нет сети, подключаемся…";

describe("SessionPending", () => {
  beforeEach(() => {
    useSessionStore.setState({ reconnecting: false });
  });

  afterEach(cleanup);

  it("shows no message on a normal boot", () => {
    render(<SessionPending />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it("shows the offline message while reconnecting", () => {
    useSessionStore.setState({ reconnecting: true });
    render(<SessionPending />);
    expect(screen.getByText(TEXT)).toBeInTheDocument();
  });

  it("updates when the store flips", () => {
    render(<SessionPending />);
    act(() => {
      useSessionStore.getState().setReconnecting();
    });
    expect(screen.getByText(TEXT)).toBeInTheDocument();
    act(() => {
      useSessionStore.getState().clearSession();
    });
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });
});
