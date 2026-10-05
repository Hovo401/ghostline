import { ActiveCallSchema } from "@ghostline/contracts";

import { apiFetch } from "../../shared/api/http-client";

import { useCallStore } from "./call-store";
import type { ActiveCall } from "./call.types";
import { getEndpointId } from "./endpoint-id";

/** `GET /calls/active` for this endpoint — `token: null` in the answer means the call's media
 * lives on another device (ADR-0023). */
export async function fetchActiveCall(): Promise<ActiveCall | null> {
  const endpointId = await getEndpointId();
  const query = new URLSearchParams({ endpointId });
  const data: unknown = await apiFetch(`/calls/active?${query.toString()}`);
  return data == null ? null : ActiveCallSchema.parse(data);
}

/** Re-syncs call state with the server after the socket reconnected (T-093): `call:updated` events
 * sent while it was down are lost, so the server's view wins. A failed request changes nothing. */
export async function resyncActiveCall(): Promise<void> {
  try {
    useCallStore.getState().reconcileActiveCall(await fetchActiveCall());
  } catch {
    // Offline again or a 5xx: the next reconnect retries.
  }
}
