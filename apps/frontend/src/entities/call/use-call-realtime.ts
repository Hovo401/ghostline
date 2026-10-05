import { useEffect } from "react";

import { getSocketClient } from "../../shared/api/socket-client";

import { resyncActiveCall } from "./active-call";
import { useCallStore } from "./call-store";

/**
 * Subscribes the shared socket's `call:incoming`/`call:updated` into
 * `call-store` — mount once (`Chat.tsx`, alongside the other `use-*-realtime`
 * hooks), per apps/frontend/CLAUDE.md's realtime rule. `call:updated` also
 * covers "answered/declined/ended on another device or tab", so a tab that
 * isn't handling the call stops ringing (ws/events.schema.ts). After a socket *re*connect it
 * re-syncs with `GET /calls/active`, since those events are lost while the socket is down.
 */
export function useCallRealtime(): void {
  const receiveIncoming = useCallStore((state) => state.receiveIncoming);
  const updateCall = useCallStore((state) => state.updateCall);

  useEffect(() => {
    const socket = getSocketClient();

    // The first connect has nothing to catch up on (`useActiveCallQuery` covers the page load).
    let hasConnected = socket.connected;
    const handleConnect = (): void => {
      if (!hasConnected) {
        hasConnected = true;
        return;
      }
      void resyncActiveCall();
    };

    socket.on("connect", handleConnect);
    socket.on("call:incoming", receiveIncoming);
    socket.on("call:updated", updateCall);
    return () => {
      socket.off("connect", handleConnect);
      socket.off("call:incoming", receiveIncoming);
      socket.off("call:updated", updateCall);
    };
  }, [receiveIncoming, updateCall]);
}
