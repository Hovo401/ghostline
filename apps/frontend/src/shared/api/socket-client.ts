import type { ClientToServerEvents, ServerToClientEvents } from "@ghostline/contracts";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";

import { getAccessToken } from "./session-store";

export type GhostlineSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * One realtime connection for the whole app — features subscribe to
 * server events (`message:new`, `presence`, …) through this instance
 * rather than opening their own. `token` is the access token from the
 * (not-yet-scaffolded) auth module; the gateway disconnects sockets that
 * don't send one (see apps/backend/src/realtime/realtime.gateway.ts).
 */
export function createSocketClient(getToken: () => string | null): GhostlineSocket {
  return io("/", {
    path: "/socket.io",
    autoConnect: false,
    auth: (callback) => {
      callback({ token: getToken() });
    },
  });
}

let singleton: GhostlineSocket | null = null;

/**
 * The one instance every `entities/*` realtime hook subscribes to (per
 * apps/frontend/CLAUDE.md's "one socket" rule). Created lazily on first
 * use rather than at module load so tests that never touch it don't open a
 * connection.
 */
export function getSocketClient(): GhostlineSocket {
  singleton ??= createSocketClient(getAccessToken);
  return singleton;
}

/**
 * Connects the shared socket for the lifetime of the calling component and
 * disconnects when the last subscriber unmounts — mount this once near the
 * root of an authenticated area (the chat feature's entry point), not per
 * event listener.
 */
export function useGhostlineSocket(): GhostlineSocket {
  const socket = getSocketClient();
  useEffect(() => {
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [socket]);
  return socket;
}
