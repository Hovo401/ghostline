import {
  ActiveCallSchema,
  CallJoinSchema,
  CallSchema,
  type Call,
  type CallJoin,
} from "@ghostline/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { ApiError, apiFetch } from "../../shared/api/http-client";
import { CALL_ACTIVE_QUERY_KEY } from "../../shared/api/query-keys";

import { useCallStore } from "./call-store";
import type { ActiveCall, CallEndReason } from "./call.types";

async function postCall(path: string): Promise<Call> {
  const data: unknown = await apiFetch(`/calls${path}`, { method: "POST" });
  return CallSchema.parse(data);
}

async function postCallJoin(path: string): Promise<CallJoin> {
  const data: unknown = await apiFetch(`/calls${path}`, { method: "POST" });
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
      const data: unknown = await apiFetch("/calls", { method: "POST", body: params });
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
    retry: MUTATION_RETRY,
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

  // Exposed alongside `hangup` for `useCallSession`'s connect timeout — it
  // needs to hang up the call server-side after already ending it locally
  // itself with a specific reason (`"unavailable"`), so it can't go through
  // `hangup()` above (that always tags the reason `"ended"`).
  const hangupMutate = hangupMutation.mutate;

  return { start, accept, decline, cancel, hangup, hangupMutate };
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

  const query = useQuery<ActiveCall | null>({
    queryKey: CALL_ACTIVE_QUERY_KEY,
    queryFn: async () => {
      const data: unknown = await apiFetch("/calls/active");
      return data == null ? null : ActiveCallSchema.parse(data);
    },
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (!query.data) return;
    applyActiveCall(query.data);
  }, [query.data, applyActiveCall]);

  return query;
}
