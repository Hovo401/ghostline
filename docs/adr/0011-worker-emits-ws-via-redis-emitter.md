# 0011. The BullMQ worker emits WS events via a redis-emitter, not a second Socket.IO server

Status: accepted

## Context

A ring timeout (call not answered in 45s) has to flip a `Call` to `missed` and tell both parties
over WS — but that job runs in the BullMQ **worker** process (`main.worker.ts`), which has never
needed to talk to a connected browser before: every existing WS emit happens from inside the API
process, through `ChatEventsGateway`'s Socket.IO server instance (see `messages.service.ts`'s
`emitToMembers`). The worker has no Socket.IO server of its own and was never meant to grow one —
`RealtimeModule` (gateways, presence) is API-only in `AppModule`, deliberately absent from
`WorkerModule`.

## Decision

The worker gets a small `RealtimeEmitter` provider built on `@socket.io/redis-emitter`, pointed
at the same Redis instance the API's `RedisIoAdapter` already uses for its Socket.IO adapter
(`realtime/redis-io.adapter.ts`). A redis-emitter publishes directly to Socket.IO's pub/sub
channel without running a Socket.IO server or holding any socket connections itself — the API
process's real adapter picks the message up and delivers it to whichever of its connected
sockets are in the target room (`user:${userId}`), exactly as if the API had emitted it locally.

## Alternatives considered

- **Give the worker a full second `Server` (Socket.IO) instance with the Redis adapter** — works,
  but a worker process holding a (connectionless) Socket.IO server just to publish is a much
  larger dependency than `@socket.io/redis-emitter`, which exists for exactly this
  emit-only-from-another-process case.
- **Route the timeout through the API process instead** — e.g. the worker calls an internal API
  endpoint that does the emit. Adds an HTTP hop and a new trust boundary (an endpoint only the
  worker should call) for something the Redis pub/sub channel already solves without one.
- **Skip the worker-side timeout and rely solely on the LiveKit webhook** (`room_finished`/
  `participant_left` never arriving because no one ever joined) to eventually resolve a stale
  `ringing` call — no fixed deadline, so a call that's never answered stays `ringing` (and
  showing an active incoming-call UI) until LiveKit's own `empty_timeout` elapses, which is
  tuned for a *joined-then-abandoned* room, not an unanswered one, and left the caller/callee's
  Redis busy-locks held for that whole window.

## Consequences

The worker now depends on the same Redis connection shape as the API's adapter (already true for
BullMQ itself, so no new infrastructure) and must be kept in sync if the adapter's channel/room
naming ever changes — `RealtimeEmitter` and `RedisIoAdapter` should keep using the identical
`user:${userId}` room convention documented in `realtime/realtime.gateway.ts`, or a worker-side
emit silently reaches no one.
