import { describe, expect, it } from "vitest";

import type { Call } from "../../entities/call";

import { buildNativeCallState, isSameNativeCallState } from "./native-call-state";

const call: Call = {
  id: "call-1",
  chatId: "chat-1",
  callerId: "peer",
  calleeId: "me",
  video: true,
  status: "active",
  createdAt: "2026-01-01T10:00:00.000Z",
  answeredAt: "2026-01-01T10:00:05.000Z",
  endedAt: null,
};

describe("buildNativeCallState", () => {
  it("maps the store's call into the native state", () => {
    expect(
      buildNativeCallState({ phase: "active", call, peerName: "Аня", micEnabled: false }),
    ).toEqual({
      callId: "call-1",
      chatId: "chat-1",
      phase: "active",
      video: true,
      peerName: "Аня",
      answeredAt: Date.parse("2026-01-01T10:00:05.000Z"),
      muted: true,
    });
  });

  it("falls back to the generic name and a null answeredAt", () => {
    const state = buildNativeCallState({
      phase: "incoming",
      call: { ...call, answeredAt: null, status: "ringing" },
      peerName: null,
      micEnabled: true,
    });
    expect(state).toMatchObject({ peerName: "Абонент", answeredAt: null, muted: false });
  });

  it("has nothing to report while idle or before the call has an id", () => {
    expect(
      buildNativeCallState({ phase: "idle", call: null, peerName: null, micEnabled: true }),
    ).toBeNull();
    expect(
      buildNativeCallState({ phase: "outgoing", call: null, peerName: null, micEnabled: true }),
    ).toBeNull();
  });
});

describe("isSameNativeCallState", () => {
  it("compares by content", () => {
    const a = buildNativeCallState({ phase: "active", call, peerName: "Аня", micEnabled: true });
    const b = buildNativeCallState({ phase: "active", call, peerName: "Аня", micEnabled: true });
    const c = buildNativeCallState({ phase: "active", call, peerName: "Аня", micEnabled: false });
    expect(isSameNativeCallState(a, b)).toBe(true);
    expect(isSameNativeCallState(a, c)).toBe(false);
    expect(isSameNativeCallState(null, null)).toBe(true);
    expect(isSameNativeCallState(a, null)).toBe(false);
  });
});
