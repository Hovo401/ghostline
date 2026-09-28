import type { ClientToServerEvents, ServerToClientEvents } from "@ghostline/contracts";
import { io, type Socket } from "socket.io-client";

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
