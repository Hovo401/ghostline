import { useEffect } from "react";

import { getSocketClient } from "../../shared/api/socket-client";

import { useCallStore } from "./call-store";

/**
 * Subscribes the shared socket's `call:incoming`/`call:updated` into
 * `call-store` — mount once (`Chat.tsx`, alongside the other `use-*-realtime`
 * hooks), per apps/frontend/CLAUDE.md's realtime rule. `call:updated` also
 * covers "answered/declined/ended on another device or tab", so a tab that
 * isn't handling the call stops ringing (ws/events.schema.ts).
 */
export function useCallRealtime(): void {
  const receiveIncoming = useCallStore((state) => state.receiveIncoming);
  const updateCall = useCallStore((state) => state.updateCall);

  useEffect(() => {
    const socket = getSocketClient();

    socket.on("call:incoming", receiveIncoming);
    socket.on("call:updated", updateCall);
    return () => {
      socket.off("call:incoming", receiveIncoming);
      socket.off("call:updated", updateCall);
    };
  }, [receiveIncoming, updateCall]);
}
