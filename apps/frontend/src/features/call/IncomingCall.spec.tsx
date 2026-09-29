import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCallStore, type Call } from "../../entities/call";
import type * as CallEntity from "../../entities/call";

import { IncomingCall } from "./IncomingCall";

const acceptFn = vi.fn();
const declineFn = vi.fn();
const stopTone = vi.fn();
const playRingtone = vi.fn(() => stopTone);
const vibrateRing = vi.fn();
const stopVibration = vi.fn();

vi.mock("../../entities/call", async (importOriginal) => {
  const actual = await importOriginal<typeof CallEntity>();
  return {
    ...actual,
    playRingtone: () => playRingtone(),
    vibrateRing: () => {
      vibrateRing();
    },
    stopVibration: () => {
      stopVibration();
    },
    useCallActions: () => ({
      start: vi.fn(),
      accept: acceptFn,
      decline: declineFn,
      cancel: vi.fn(),
      hangup: vi.fn(),
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
    callerId: "peer-1",
    calleeId: "me",
    video: true,
    status: "ringing",
    createdAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    ...overrides,
  };
}

describe("IncomingCall", () => {
  beforeEach(() => {
    acceptFn.mockReset();
    declineFn.mockReset();
    playRingtone.mockClear();
    stopTone.mockClear();
    vibrateRing.mockClear();
    stopVibration.mockClear();
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

  it("renders nothing outside the incoming phase", () => {
    const { container } = render(<IncomingCall />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the caller and plays the ringtone while incoming", () => {
    useCallStore.getState().receiveIncoming(call());
    render(<IncomingCall />);

    expect(screen.getByText("Тест Пир")).toBeInTheDocument();
    expect(screen.getByText("Видеозвонок")).toBeInTheDocument();
    expect(playRingtone).toHaveBeenCalled();
    expect(vibrateRing).toHaveBeenCalled();
  });

  it("stops the ringtone/vibration once no longer incoming", () => {
    useCallStore.getState().receiveIncoming(call());
    const { rerender } = render(<IncomingCall />);
    useCallStore.getState().updateCall(call({ status: "cancelled" }));
    rerender(<IncomingCall />);
    expect(stopTone).toHaveBeenCalled();
    expect(stopVibration).toHaveBeenCalled();
  });

  it("only offers an audio-only answer for a voice call", () => {
    useCallStore.getState().receiveIncoming(call({ video: false }));
    render(<IncomingCall />);
    expect(screen.queryByLabelText("Ответить видео")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Ответить аудио")).toBeInTheDocument();
  });

  it("Ответить аудио sets a camera-off intent before accepting", () => {
    useCallStore.getState().receiveIncoming(call());
    render(<IncomingCall />);
    fireEvent.click(screen.getByLabelText("Ответить аудио"));
    expect(useCallStore.getState().localVideoIntent).toBe(false);
    expect(acceptFn).toHaveBeenCalledWith("call-a");
  });

  it("Ответить видео keeps the video intent and accepts", () => {
    useCallStore.getState().receiveIncoming(call());
    render(<IncomingCall />);
    fireEvent.click(screen.getByLabelText("Ответить видео"));
    expect(useCallStore.getState().localVideoIntent).toBe(true);
    expect(acceptFn).toHaveBeenCalledWith("call-a");
  });

  it("Отклонить declines the call", () => {
    useCallStore.getState().receiveIncoming(call());
    render(<IncomingCall />);
    fireEvent.click(screen.getByLabelText("Отклонить"));
    expect(declineFn).toHaveBeenCalledWith("call-a");
  });
});
