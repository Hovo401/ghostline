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
} from "@nestjs/websockets";
import type { Socket } from "socket.io";

type GatewaySocket = Socket<ClientToServerEvents, ServerToClientEvents>;

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

  handleConnection(client: GatewaySocket): void {
    // socket.io types `handshake.auth` as `any` — narrow it explicitly
    // rather than propagating that through the rest of this method.
    const auth = client.handshake.auth as Record<string, unknown>;
    const token = auth.token;
    if (typeof token !== "string" || token.length === 0) {
      client.disconnect(true);
      return;
    }

    // TODO(auth): verify the access token and join `user:${userId}` so
    // every device of that user receives the same events (REQUIREMENTS.md
    // §7.3/§7.5). Disconnecting unauthenticated sockets is intentional —
    // every WS event must be scoped to a real, checked user.
    this.logger.debug(`socket ${client.id} connected (auth not yet verified)`);
  }

  handleDisconnect(client: GatewaySocket): void {
    this.logger.debug(`socket ${client.id} disconnected`);
  }

  @SubscribeMessage("typing")
  handleTyping(@MessageBody() body: unknown, @ConnectedSocket() client: GatewaySocket): void {
    const payload = typingClientPayloadSchema.parse(body);
    // TODO(auth): resolve the authenticated userId for `client` instead of
    // broadcasting anonymously once the connection above verifies a token.
    client.broadcast.to(payload.chatId).emit("typing", { ...payload, userId: "" });
  }
}
