import type { ClientToServerEvents, ServerToClientEvents } from "@ghostline/contracts";
import { typingClientPayloadSchema } from "@ghostline/contracts";
import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { DefaultEventsMap, Server, Socket } from "socket.io";

import { TokenService } from "../auth/token.service";

import { PresenceService } from "./presence.service";

interface GatewaySocketData {
  userId: string;
}

type GatewaySocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  GatewaySocketData
>;

/**
 * Server → client push (message:new, presence, …) belongs to the feature
 * module that owns the event (messages, chats, presence) — they inject
 * `@WebSocketServer() server` from here and call
 * `server.to(\`user:${userId}\`).emit(...)`. This gateway itself only owns
 * the connection lifecycle and the one purely-transient client → server
 * event (`typing`, REQUIREMENTS.md §7.5) — see docs/ARCHITECTURE.md.
 */
@WebSocketGateway({ cors: true })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    private readonly tokens: TokenService,
    private readonly presence: PresenceService,
  ) {}

  handleConnection(client: GatewaySocket): void {
    // socket.io types `handshake.auth` as `any` — narrow it explicitly
    // rather than propagating that through the rest of this method.
    const auth = client.handshake.auth as Record<string, unknown>;
    const token = auth.token;
    if (typeof token !== "string" || token.length === 0) {
      client.disconnect(true);
      return;
    }

    // Disconnecting unauthenticated/invalid sockets is intentional — every
    // WS event must be scoped to a real, checked user (REQUIREMENTS.md
    // §7.3/§7.5).
    let userId: string;
    try {
      userId = this.tokens.verifyAccessToken(token).sub;
    } catch {
      client.disconnect(true);
      return;
    }

    client.data.userId = userId;
    void client.join(`user:${userId}`);
    this.logger.debug(`socket ${client.id} connected as user ${userId}`);
    // FR-USER-03/04, FR-RT-03: this is this user's first-seen-online signal
    // for every device — `PresenceService` only broadcasts when it's their
    // first live socket, so a second tab/device doesn't re-announce it.
    void this.presence.handleConnect(this.server, userId, client.id);
  }

  handleDisconnect(client: GatewaySocket): void {
    this.logger.debug(`socket ${client.id} disconnected`);
    const userId = client.data.userId;
    if (userId) {
      void this.presence.handleDisconnect(this.server, userId, client.id);
    }
  }

  @SubscribeMessage("typing")
  handleTyping(@MessageBody() body: unknown, @ConnectedSocket() client: GatewaySocket): void {
    const payload = typingClientPayloadSchema.parse(body);
    client.broadcast.to(payload.chatId).emit("typing", { ...payload, userId: client.data.userId });
  }
}
