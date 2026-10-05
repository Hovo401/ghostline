import { act, cleanup, render } from "@testing-library/react";
import { ConnectionQuality, ConnectionState } from "livekit-client";
import type { Track } from "livekit-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCallStore } from "../../entities/call";
import type * as CallEntity from "../../entities/call";

import { CallRoot } from "./CallRoot";
import type { CallSessionHandle } from "./use-call-session";

const routerMocks = vi.hoisted(() => ({ pathname: "/app", navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (location: { pathname: string }) => unknown }) =>
    select({ pathname: routerMocks.pathname }),
  useNavigate: () => routerMocks.navigate,
  useRouter: () => undefined,
}));

const ringback = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn() }));

const attach = vi.fn();
const detach = vi.fn();
const remoteAudioTrack = { attach, detach } as unknown as Track;

vi.mock("../../entities/call", async (importOriginal) => {
  const actual = await importOriginal<typeof CallEntity>();
  return {
    ...actual,
    playRingback: (): (() => void) => {
      ringback.play();
      return ringback.stop;
    },
    useCallActions: () => ({
      start: vi.fn(),
      accept: vi.fn(),
      decline: vi.fn(),
      cancel: vi.fn(),
      hangup: vi.fn(),
      hangupMutate: vi.fn(),
    }),
  };
});

vi.mock("./use-call-peer", () => ({
  useCallPeer: () => ({ id: "peer-1", displayName: "Тест Пир" }),
}));

vi.mock("./IncomingCall", () => ({ IncomingCall: () => null }));
vi.mock("./CallEnded", () => ({ CallEnded: () => null }));

vi.mock("./use-call-session", () => ({
  useCallSession: (): CallSessionHandle => ({
    connectionState: ConnectionState.Connected,
    quality: ConnectionQuality.Good,
    remoteSpeaking: false,
    localVideoTrack: null,
    remoteVideoTrack: null,
    remoteAudioTrack,
    micEnabled: true,
    cameraEnabled: false,
    mediaError: { camera: null, microphone: null },
    canFlipCamera: false,
    toggleMic: vi.fn(),
    setMic: vi.fn().mockResolvedValue(undefined),
    toggleCamera: vi.fn(),
    flipCamera: vi.fn(),
  }),
}));

describe("CallRoot", () => {
  beforeEach(() => {
    ringback.play.mockReset();
    ringback.stop.mockReset();
    attach.mockReset();
    detach.mockReset();
    useCallStore.setState({
      phase: "active",
      call: {
        id: "call-a",
        chatId: "chat-1",
        callerId: "me",
        calleeId: "peer-1",
        video: false,
        status: "active",
        createdAt: new Date().toISOString(),
        answeredAt: new Date().toISOString(),
        endedAt: null,
        callerEndpointId: null,
        calleeEndpointId: null,
      },
      livekitUrl: "wss://lk",
      token: "tok",
      minimized: false,
      localVideoIntent: false,
      draft: null,
      endReason: null,
      remoteJoined: true,
      held: false,
    });
  });

  afterEach(cleanup);

  // Regression: the remote `<audio>` used to live inside `CallScreen`, which
  // renders nothing while minimized — minimizing detached the track and the
  // peer went silent.
  it("keeps the remote audio attached while the call is minimized", () => {
    const { container } = render(<CallRoot />);
    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(attach).toHaveBeenCalledWith(audio);

    act(() => {
      useCallStore.getState().minimize();
    });

    expect(container.querySelector("[role=dialog]")).toBeNull();
    expect(container.querySelector("audio")).toBe(audio);
    expect(detach).not.toHaveBeenCalled();
  });

  it("rings back while dialing, also once minimized, and stops when the call moves on", () => {
    useCallStore.setState({ phase: "outgoing" });
    render(<CallRoot />);
    expect(ringback.play).toHaveBeenCalledTimes(1);

    act(() => {
      useCallStore.getState().minimize();
    });
    expect(ringback.stop).not.toHaveBeenCalled();

    act(() => {
      useCallStore.setState({ phase: "connecting" });
    });
    expect(ringback.stop).toHaveBeenCalledTimes(1);
  });

  it("mutes the remote audio while the call is on hold, without detaching it", () => {
    const { container } = render(<CallRoot />);
    const audio = container.querySelector("audio");
    expect(audio?.muted).toBe(false);

    act(() => {
      useCallStore.getState().setHeld(true);
    });
    expect(container.querySelector("audio")).toBe(audio);
    expect(audio?.muted).toBe(true);
    expect(detach).not.toHaveBeenCalled();

    act(() => {
      useCallStore.getState().setHeld(false);
    });
    expect(audio?.muted).toBe(false);
  });
});
