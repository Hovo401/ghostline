import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConnectionQuality, ConnectionState } from "livekit-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCallStore, type Call } from "../../entities/call";
import type * as CallEntity from "../../entities/call";

import { CallScreen } from "./CallScreen";
import type { CallSessionHandle } from "./use-call-session";

const cancelFn = vi.fn();
const hangupFn = vi.fn();

vi.mock("../../entities/call", async (importOriginal) => {
  const actual = await importOriginal<typeof CallEntity>();
  return {
    ...actual,
    useCallActions: () => ({
      start: vi.fn(),
      accept: vi.fn(),
      decline: vi.fn(),
      cancel: cancelFn,
      hangup: hangupFn,
      hangupMutate: vi.fn(),
    }),
  };
});

vi.mock("./use-call-peer", () => ({
  useCallPeer: () => ({ id: "peer-1", displayName: "Тест Пир" }),
}));

function call(overrides: Partial<Call> = {}): Call {
  return {
    id: "call-a",
    chatId: "chat-1",
    callerId: "me",
    calleeId: "peer-1",
    video: true,
    status: "active",
    createdAt: new Date().toISOString(),
    answeredAt: new Date().toISOString(),
    endedAt: null,
    ...overrides,
  };
}

function fakeSession(overrides: Partial<CallSessionHandle> = {}): CallSessionHandle {
  return {
    connectionState: ConnectionState.Connected,
    quality: ConnectionQuality.Good,
    remoteSpeaking: false,
    localVideoTrack: null,
    remoteVideoTrack: null,
    remoteAudioTrack: null,
    micEnabled: true,
    cameraEnabled: true,
    mediaError: { camera: null, microphone: null },
    canFlipCamera: false,
    toggleMic: vi.fn(),
    toggleCamera: vi.fn(),
    flipCamera: vi.fn(),
    ...overrides,
  };
}

describe("CallScreen", () => {
  beforeEach(() => {
    cancelFn.mockReset();
    hangupFn.mockReset();
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

  it("renders nothing while idle", () => {
    const { container } = render(<CallScreen session={fakeSession()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the outgoing ringing screen from a draft, before any Call exists", () => {
    useCallStore.getState().startDraft("chat-1", true);
    render(<CallScreen session={fakeSession()} />);

    expect(screen.getByText("Тест Пир")).toBeInTheDocument();
    expect(screen.getByText(/вызов…/)).toBeInTheDocument();
  });

  it("shows the outgoing ringing screen and cancels on demand", () => {
    useCallStore.getState().startDraft("chat-1", false);
    useCallStore
      .getState()
      .applyOutgoingJoin({ call: call({ status: "ringing" }), livekitUrl: "wss://lk", token: "t" });
    render(<CallScreen session={fakeSession()} />);

    expect(screen.getByText("Тест Пир")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Отменить звонок"));
    expect(cancelFn).toHaveBeenCalled();
  });

  it("renders nothing while minimized", () => {
    useCallStore.getState().startDraft("chat-1", true);
    useCallStore.getState().minimize();
    const { container } = render(<CallScreen session={fakeSession()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the in-call controls once active and hangs up on demand", () => {
    useCallStore.setState({ call: call(), livekitUrl: "wss://lk", token: "tok", phase: "active" });
    render(<CallScreen session={fakeSession()} />);

    expect(screen.getByLabelText("Завершить звонок")).toBeInTheDocument();
    expect(screen.getAllByText("Тест Пир")[0]).toBeInTheDocument();
    expect(screen.getByLabelText("Выключить микрофон")).toBeInTheDocument();
    expect(screen.getByLabelText("Выключить камеру")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Завершить звонок"));
    expect(hangupFn).toHaveBeenCalled();
  });

  it("shows 'Соединение…' while connecting (remote not joined yet), not the timer", () => {
    useCallStore.setState({
      call: call({ status: "active" }),
      livekitUrl: "wss://lk",
      token: "tok",
      phase: "connecting",
    });
    render(<CallScreen session={fakeSession()} />);
    expect(screen.getByText("Соединение…")).toBeInTheDocument();
  });
});
