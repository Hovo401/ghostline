import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCallStore, type Call } from "../../entities/call";

import { CallMiniBar } from "./CallMiniBar";

vi.mock("./use-call-peer", () => ({
  useCallPeer: () => ({ id: "peer-1", displayName: "Тест Пир", avatarUrl: "/a.png" }),
}));

function call(overrides: Partial<Call> = {}): Call {
  return {
    id: "call-a",
    chatId: "chat-1",
    callerId: "me",
    calleeId: "peer-1",
    video: false,
    status: "active",
    createdAt: new Date().toISOString(),
    answeredAt: new Date().toISOString(),
    endedAt: null,
    ...overrides,
  };
}

describe("CallMiniBar", () => {
  beforeEach(() => {
    useCallStore.setState({
      phase: "idle",
      call: null,
      livekitUrl: null,
      token: null,
      minimized: false,
      localVideoIntent: true,
      draft: null,
      endReason: null,
      remoteJoined: false,
    });
  });

  afterEach(cleanup);

  it("renders nothing when not minimized", () => {
    useCallStore.setState({ call: call(), livekitUrl: "wss://lk", token: "t", phase: "active" });
    const { container } = render(<CallMiniBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when minimized but idle (no call)", () => {
    useCallStore.getState().minimize();
    const { container } = render(<CallMiniBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the peer and status once minimized during an active call", () => {
    useCallStore.setState({ call: call(), livekitUrl: "wss://lk", token: "t", phase: "active" });
    useCallStore.getState().minimize();
    render(<CallMiniBar />);

    expect(screen.getByText("Тест Пир")).toBeInTheDocument();
    expect(screen.getByText("Аудио")).toBeInTheDocument();
    expect(document.querySelector("img")).toHaveAttribute("src", "/a.png");
  });

  it("restores the call screen on click", () => {
    useCallStore.setState({ call: call(), livekitUrl: "wss://lk", token: "t", phase: "active" });
    useCallStore.getState().minimize();
    render(<CallMiniBar />);

    fireEvent.click(screen.getByLabelText("Развернуть звонок"));
    expect(useCallStore.getState().minimized).toBe(false);
  });
});
