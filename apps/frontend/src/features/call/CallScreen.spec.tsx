import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConnectionQuality, ConnectionState } from "livekit-client";
import type { Track } from "livekit-client";
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

const pipState = vi.hoisted(() => ({ active: false }));

vi.mock("./use-native-pip", () => ({
  useNativePip: () => pipState.active,
}));

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
    pipState.active = false;
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

  // Regression: the local `<video>` mounts only once the camera is on, often
  // with a track that was already published earlier — it must still get
  // attached (was a black self-preview on mobile).
  it("attaches an already-known track to a <video> that mounts later", () => {
    useCallStore.setState({ call: call(), livekitUrl: "wss://lk", token: "tok", phase: "active" });
    const attach = vi.fn();
    const detach = vi.fn();
    const track = { attach, detach } as unknown as Track;

    const { rerender, container } = render(
      <CallScreen session={fakeSession({ localVideoTrack: track, cameraEnabled: false })} />,
    );
    expect(attach).not.toHaveBeenCalled();

    rerender(<CallScreen session={fakeSession({ localVideoTrack: track, cameraEnabled: true })} />);
    const video = container.querySelector("video");
    expect(attach).toHaveBeenCalledWith(video);

    rerender(
      <CallScreen session={fakeSession({ localVideoTrack: track, cameraEnabled: false })} />,
    );
    expect(detach).toHaveBeenCalledWith(video);
  });

  describe("picture-in-picture", () => {
    const track = { attach: vi.fn(), detach: vi.fn() } as unknown as Track;

    beforeEach(() => {
      pipState.active = true;
      useCallStore.setState({
        call: call(),
        livekitUrl: "wss://lk",
        token: "tok",
        phase: "active",
      });
    });

    it("renders only the remote video, without header or controls", () => {
      const { container } = render(
        <CallScreen session={fakeSession({ remoteVideoTrack: track, localVideoTrack: track })} />,
      );

      expect(container.querySelectorAll("video")).toHaveLength(1);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByText("Тест Пир")).not.toBeInTheDocument();
    });

    it("falls back to the avatar when the remote camera is off", () => {
      const { container } = render(<CallScreen session={fakeSession()} />);

      expect(container.querySelector("video")).toBeNull();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("still renders while the in-app call UI is minimized", () => {
      useCallStore.setState({ minimized: true });
      render(<CallScreen session={fakeSession({ remoteVideoTrack: track })} />);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});
