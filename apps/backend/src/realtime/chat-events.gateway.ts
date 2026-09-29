import type { ClientToServerEvents, ServerToClientEvents } from "@ghostline/contracts";
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server } from "socket.io";

/**
 * No connection lifecycle, no `@SubscribeMessage` handlers — this gateway
 * exists purely so feature modules (chats, messages) can get a typed handle
 * on the shared Socket.IO server without reaching into `RealtimeGateway`
 * (apps/backend/CLAUDE.md's realtime pattern: "injects `@WebSocketServer()
 * server` from its own place"). `@nestjs/websockets` only assigns `server`
 * onto classes decorated with `@WebSocketGateway`, and because this uses
 * the same (default) port/namespace as `RealtimeGateway`, both resolve to
 * the one underlying io `Server` — see `SocketServerProvider` in
 * `@nestjs/websockets`, keyed by port+path, not by gateway class.
 */
@WebSocketGateway({ cors: true })
export class ChatEventsGateway {
  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;
}
