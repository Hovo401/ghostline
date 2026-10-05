import {
  ANSWERED_ELSEWHERE_ERROR,
  CallJoinSchema,
  CallSchema,
  type Call,
  type CallJoin,
} from "@ghostline/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { ApiError, apiFetch } from "../../shared/api/http-client";
import { CALL_ACTIVE_QUERY_KEY } from "../../shared/api/query-keys";

import { fetchActiveCall } from "./active-call";
import { useCallStore } from "./call-store";
import type { ActiveCall, CallEndReason } from "./call.types";
import { getEndpointId } from "./endpoint-id";

async function postCall(path: string): Promise<Call> {
  const data: unknown = await apiFetch(`/calls${path}`, { method: "POST" });
  return CallSchema.parse(data);
}

async function postCallJoin(path: string): Promise<CallJoin> {
  const endpointId = await getEndpointId();
  const data: unknown = await apiFetch(`/calls${path}`, { method: "POST", body: { endpointId } });
  return CallJoinSchema.parse(data);
}

/** Maps `POST /calls`'s failure into the `CallEndReason` `CallEnded` shows —
 * there's no `Call` object at all yet when this fires, so these reasons
 * exist purely client-side (`call.types.ts`). */
function mapStartError(error: unknown): CallEndReason {
  if (!(error instanceof ApiError)) return "unavailable";
  if (error.status === 409) return "busy";
  if (error.status === 403) return "forbidden";
  if (error.status === 429) return "rate_limited";
  return "unavailable";
}

/** Retries for the idempotent lifecycle endpoints (calls.service.ts) — a
 * failed hangup/cancel/decline/accept request doesn't get retried forever,
 * but a flaky network shouldn't leave the call stuck open server-side when
 * this device has already moved on locally. */
const MUTATION_RETRY = 2;

/**
 * Start/accept/decline/cancel/hangup mutations for the current call (calls
 * plan §Фаза 2/3) — each writes its result into `call-store` (the one piece
 * of client call state, following `entities/attachment/media-viewer-store`'s
 * pattern) rather than a TanStack Query cache, since a call isn't "server
 * data displayed in a list", it's a single ephemeral session this device is
 * in.
 *
 * Every action here is exposed as a plain function, not a raw mutation
 * object: each one has to flip local state *synchronously*, before the
 * network request even fires (optimistic "Calling…" on `start`, instant
 * ringing-stops on hangup/cancel/decline) — `call-store`'s `endLocally` /
 * `startDraft` / `beginConnecting` do that, and the mutation underneath just
 * carries it to the server, retried a couple of times since these endpoints
 * are idempotent. A failed mutation never reverts the local state: the call
 * already ended locally, and the server's own ring-timeout/webhook cleans up
 * a call this device gave up on.
 */
export function useCallActions() {
  const startDraft = useCallStore((state) => state.startDraft);
  const applyOutgoingJoin = useCallStore((state) => state.applyOutgoingJoin);
  const beginConnecting = useCallStore((state) => state.beginConnecting);
  const applyJoin = useCallStore((state) => state.applyJoin);
  const endLocally = useCallStore((state) => state.endLocally);
  const answeredElsewhere = useCallStore((state) => state.answeredElsewhere);

  // Set when the user cancels while `start`'s request is still in flight —
  // there's no call id to cancel yet, so the cancel is deferred until the
  // response arrives instead of leaving an orphaned ringing call server-side.
  const cancelPendingRef = useRef(false);

  const cancelMutation = useMutation({
    mutationFn: (callId: string) => postCall(`/${callId}/cancel`),
    retry: MUTATION_RETRY,
  });

  const startMutation = useMutation({
    mutationFn: async (params: { chatId: string; video: boolean }) => {
      const endpointId = await getEndpointId();
      const data: unknown = await apiFetch("/calls", {
        method: "POST",
        body: { ...params, endpointId },
      });
      return CallJoinSchema.parse(data);
    },
    onSuccess: (join) => {
      if (cancelPendingRef.current) {
        cancelPendingRef.current = false;
        cancelMutation.mutate(join.call.id);
        return;
      }
      applyOutgoingJoin(join);
    },
    onError: (error: unknown) => {
      cancelPendingRef.current = false;
      endLocally(mapStartError(error));
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (callId: string) => postCallJoin(`/${callId}/accept`),
    onSuccess: (join) => {
      applyJoin(join);
    },
    onError: (error: unknown, callId) => {
      const { call, phase } = useCallStore.getState();
      if (call?.id !== callId || phase !== "connecting") return;
      if (error instanceof ApiError && error.detail === ANSWERED_ELSEWHERE_ERROR) {
        answeredElsewhere(call);
        return;
      }
      endLocally("failed");
    },
    // A 4xx is a verdict (answered elsewhere, call gone) — retrying can't change it.
    retry: (failureCount, error) =>
      failureCount < MUTATION_RETRY &&
      !(error instanceof ApiError && error.status >= 400 && error.status < 500),
  });

  const declineMutation = useMutation({
    mutationFn: (callId: string) => postCall(`/${callId}/decline`),
    retry: MUTATION_RETRY,
  });

  const hangupMutation = useMutation({
    mutationFn: (callId: string) => postCall(`/${callId}/hangup`),
    retry: MUTATION_RETRY,
  });

  const start = (params: { chatId: string; video: boolean }): void => {
    cancelPendingRef.current = false;
    startDraft(params.chatId, params.video);
    startMutation.mutate(params);
  };

  const accept = (callId: string): void => {
    beginConnecting();
    acceptMutation.mutate(callId);
  };

  const decline = (callId: string): void => {
    endLocally("declined");
    declineMutation.mutate(callId);
  };

  const cancel = (): void => {
    endLocally("cancelled");
    const callId = useCallStore.getState().call?.id;
    if (callId) {
      cancelMutation.mutate(callId);
    } else if (startMutation.isPending) {
      cancelPendingRef.current = true;
    }
  };

  const hangup = (): void => {
    endLocally("ended");
    const callId = useCallStore.getState().call?.id;
    if (callId) hangupMutation.mutate(callId);
  };

  /** Logout while a call is up: end it on the server first (the session is about to go), then
   * wipe the call state. A failed request doesn't hold the logout back. */
  const leaveCall = async (): Promise<void> => {
    const { phase, call } = useCallStore.getState();
    if (call && phase !== "idle" && phase !== "ended") {
      endLocally(phase === "incoming" ? "declined" : phase === "outgoing" ? "cancelled" : "ended");
      const mutation =
        phase === "incoming"
          ? declineMutation
          : phase === "outgoing"
            ? cancelMutation
            : hangupMutation;
      await mutation.mutateAsync(call.id).catch(() => undefined);
    }
    useCallStore.getState().reset();
    useCallStore.getState().clearElsewhere();
  };

  // Exposed alongside `hangup` for `useCallSession`'s connect timeout — it
  // needs to hang up the call server-side after already ending it locally
  // itself with a specific reason (`"unavailable"`), so it can't go through
  // `hangup()` above (that always tags the reason `"ended"`).
  const hangupMutate = hangupMutation.mutate;

  return { start, accept, decline, cancel, hangup, hangupMutate, leaveCall };
}

/**
 * Answers `callId` as soon as this tab is ringing for exactly that call — and never otherwise.
 * For the notification / service-worker "Ответить" handoffs (T-093): the tab they reach may not
 * have the ring yet (a fresh tab learns of the call from `GET /calls/active`), and may by now be
 * idle, in another call, or past this one — in which case answering would hijack or revive
 * something. The wish is kept until the call shows up as `incoming` and then fires once.
 */
export function useAnswerWhenIncoming(): (callId: string) => void {
  const { accept } = useCallActions();
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  const wantedRef = useRef<string | null>(null);

  const tryAnswer = useCallback((): void => {
    const { phase, call } = useCallStore.getState();
    const wanted = wantedRef.current;
    if (wanted === null || phase !== "incoming" || call?.id !== wanted) return;
    wantedRef.current = null;
    acceptRef.current(wanted);
  }, []);

  useEffect(() => useCallStore.subscribe(tryAnswer), [tryAnswer]);

  return useCallback(
    (callId: string): void => {
      wantedRef.current = callId;
      tryAnswer();
    },
    [tryAnswer],
  );
}

/**
 * `GET /calls/active` — fired once on mount (`Chat.tsx`, alongside the other
 * realtime hooks) so a page reload/tab reopen during a call reconnects to it
 * instead of leaving the call silently stuck open server-side until
 * `departure_timeout` (calls plan §Фаза 3 "автовосстановление"). Only ever
 * applied while this tab is idle (`call-store`'s `applyActiveCall`) — never
 * clobbers a call already in progress in this tab.
 */
export function useActiveCallQuery() {
  const applyActiveCall = useCallStore((state) => state.applyActiveCall);
  const queryClient = useQueryClient();

  const query = useQuery<ActiveCall | null>({
    queryKey: CALL_ACTIVE_QUERY_KEY,
    queryFn: fetchActiveCall,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (!query.data) return;
    applyActiveCall(query.data);
    // One-shot resume signal: consume it, or a later remount of `Chat.tsx`
    // (e.g. back from Settings) would re-apply this long-ended call.
    queryClient.setQueryData(CALL_ACTIVE_QUERY_KEY, null);
  }, [query.data, applyActiveCall, queryClient]);

  return query;
}
