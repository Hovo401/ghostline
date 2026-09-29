import type { Call, Message } from "@ghostline/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { Emitter } from "@socket.io/redis-emitter";
import type Redis from "ioredis";

import { REDIS_CLIENT } from "../redis/redis.module";

/**
 * Worker-only stand-in for `ChatEventsGateway.server` (docs/adr/0011): the
 * BullMQ worker process (`main.worker.ts`) never binds a Socket.IO server
 * of its own, but a job it runs (the call ring-timeout finalizer,
 * `jobs/calls.processor.ts`) still needs to push WS events to connected
 * clients. `@socket.io/redis-emitter` publishes onto the exact same Redis
 * pub/sub channel `RedisIoAdapter`'s `@socket.io/redis-adapter` subscribes
 * to on the API process's Socket.IO server, so every replica fans this out
 * just like an in-process `server.to(...).emit(...)` would — see
 * `realtime/redis-io.adapter.ts`.
 *
 * Deliberately narrow (two concrete methods, not a generic passthrough):
 * the only caller today is the ring-timeout processor, which only ever
 * emits `call:updated` and `message:new`.
 */
@Injectable()
export class RealtimeEmitter {
  private readonly emitter: Emitter;

  constructor(@Inject(REDIS_CLIENT) redis: Redis) {
    this.emitter = new Emitter(redis);
  }

  emitCallUpdated(userId: string, payload: Call): void {
    this.emitter.to(`user:${userId}`).emit("call:updated", payload);
  }

  emitMessageNew(userId: string, payload: Message): void {
    this.emitter.to(`user:${userId}`).emit("message:new", payload);
  }
}
