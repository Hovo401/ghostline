import { useCallback, useEffect, useRef } from "react";

import { useCallActions, useCallStore } from "../../entities/call";
import {
  consumeNativeLaunchAction,
  listenForNativeCallCommands,
  setNativeCallState,
  type NativeCallCommand,
  type NativeCallState,
} from "../../shared/native";

import {
  buildNativeCallState,
  isSameNativeCallState,
  type NativeCallStateInput,
} from "./native-call-state";
import { useCallPeer } from "./use-call-peer";

/** A native "Ответить" that the store has not shown as ringing within this long is dropped. */
export const PENDING_ANSWER_TTL_MS = 60_000;

interface PendingAnswer {
  callId: string;
  video: boolean;
  expiresAt: number;
}

/**
 * Keeps the phone's call layer (ongoing notification, Telecom entry, call screen) in step with the
 * page (ADR-0017, T-086): reports every phase/mute change to native and executes the commands native
 * sends back — "Ответить" (accepts at once, no second tap on the site), "Перезвонить", hang up, mute,
 * open. In a browser or an APK without the call layer every native wrapper is a silent no-op.
 *
 * Called once, from `CallRoot`, next to `useCallSession` whose `toggleMic`/`micEnabled` it needs.
 */
export function useNativeCallBridge(session: { micEnabled: boolean; toggleMic: () => void }): void {
  const phase = useCallStore((state) => state.phase);
  const call = useCallStore((state) => state.call);
  const draft = useCallStore((state) => state.draft);
  const actions = useCallActions();
  const peer = useCallPeer(call?.chatId ?? draft?.chatId ?? null, call);
  const peerName = peer?.displayName ?? null;

  // The command handler lives for the whole app, so it reads the latest of these through refs.
  const actionsRef = useRef(actions);
  const toggleMicRef = useRef(session.toggleMic);
  actionsRef.current = actions;
  toggleMicRef.current = session.toggleMic;

  const pendingAnswerRef = useRef<PendingAnswer | null>(null);
  const acceptedCallIdRef = useRef<string | null>(null);

  // Phase -> native, on every change (not twice in a row with the same content).
  const reportedRef = useRef<NativeCallState | null>(null);
  const micEnabled = session.micEnabled;
  useEffect(() => {
    const input: NativeCallStateInput = { phase, call, peerName, micEnabled };
    const next = buildNativeCallState(input);
    if (isSameNativeCallState(reportedRef.current, next)) return;
    reportedRef.current = next;
    void setNativeCallState(next);
  }, [phase, call, peerName, micEnabled]);

  // The pending native answer is resolved from the store's own subscription, so `accept` runs in the
  // very tick that `incoming` appears — before React paints the ringing overlay.
  const resolvePendingAnswer = useCallback((): void => {
    const pending = pendingAnswerRef.current;
    if (!pending) return;
    const state = useCallStore.getState();
    if (Date.now() > pending.expiresAt) {
      pendingAnswerRef.current = null;
      return;
    }
    if (state.call?.id !== pending.callId) return;
    if (state.phase === "ended") {
      pendingAnswerRef.current = null;
      return;
    }
    if (state.phase !== "incoming") return;
    pendingAnswerRef.current = null;
    if (acceptedCallIdRef.current === pending.callId) return;
    acceptedCallIdRef.current = pending.callId;
    state.setLocalVideoIntent(pending.video);
    actionsRef.current.accept(pending.callId);
  }, []);

  useEffect(() => {
    return useCallStore.subscribe(resolvePendingAnswer);
  }, [resolvePendingAnswer]);

  const handleCommand = useCallback(
    (command: NativeCallCommand): void => {
      const state = useCallStore.getState();
      switch (command.type) {
        case "answer":
          if (acceptedCallIdRef.current === command.callId) return;
          pendingAnswerRef.current = {
            callId: command.callId,
            video: command.video,
            expiresAt: Date.now() + PENDING_ANSWER_TTL_MS,
          };
          resolvePendingAnswer();
          return;
        case "callback":
          // `ended` = the summary screen is still up: dismiss it first, as its own timer would.
          if (state.phase === "ended") state.reset();
          if (state.phase === "idle" || state.phase === "ended") {
            actionsRef.current.start({ chatId: command.chatId, video: command.video });
          }
          return;
        case "hangup":
          if (state.phase === "outgoing") actionsRef.current.cancel();
          else if (
            state.phase === "connecting" ||
            state.phase === "active" ||
            state.phase === "reconnecting"
          ) {
            actionsRef.current.hangup();
          }
          return;
        case "toggleMute":
          toggleMicRef.current();
          return;
        case "open":
          state.restore();
          return;
      }
    },
    [resolvePendingAnswer],
  );

  // An answer/callback chosen while the page was not running, then the live buttons.
  useEffect(() => {
    void consumeNativeLaunchAction().then((action) => {
      if (action) handleCommand(action);
    });
    return listenForNativeCallCommands(handleCommand);
  }, [handleCommand]);
}
