import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type Redis from "ioredis";
import type { Server, ServerOptions } from "socket.io";

/**
 * Wires the Socket.IO redis adapter so gateway events fan out across every
 * backend replica (REQUIREMENTS.md §6.7/§7.5) instead of only the process
 * that received the originating HTTP/WS request. Registered once in
 * main.ts via `app.useWebSocketAdapter(new RedisIoAdapter(app, redis))`.
 */
export class RedisIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly redis: Redis,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    // @nestjs/platform-socket.io types this return as `any` — the actual
    // runtime value is always a socket.io Server.
    const server = super.createIOServer(port, options) as Server;
    const pubClient = this.redis.duplicate();
    const subClient = this.redis.duplicate();
    server.adapter(createAdapter(pubClient, subClient));
    return server;
  }
}
