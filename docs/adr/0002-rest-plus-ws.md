# 0002. State changes over REST, delivery over WebSocket

Status: accepted

## Context

A chat app needs both request/response operations (send a message, edit it, mark read) and
server-initiated push (a message arrives while the client is idle). One transport for both is
possible — an all-WebSocket API — but REQUIREMENTS.md needs idempotent sends (`clientMessageId`
dedup), request validation, and ordinary HTTP retry/timeout semantics for the write path.

## Decision

Every state-changing action (send, edit, delete, mark-read, upload) is a REST call under
`/api/v1`. WebSocket (`/socket.io`) carries two things only: server→client push
(`message:new`, `presence`, …) and the one purely ephemeral client→server event, `typing`
(REQUIREMENTS.md §7.5).

## Alternatives considered

- **All-WebSocket (send a message as a socket emit)** — loses ordinary HTTP idempotency/retry
  tooling, and validation errors need a bespoke ack protocol instead of an HTTP status code.
- **All-REST with polling instead of WS push** — REQUIREMENTS.md's "arrives in ≤300ms" latency
  budget and "typing…" indicator both need a push channel; polling can't hit either cheaply.

## Consequences

`RealtimeGateway` stays small (connection lifecycle + `typing` only); every other WS event is
emitted by the feature module that owns the REST route that triggered it, via
`server.to(\`user:${id}\`).emit(...)`, after its DB write commits. A client that missed events
while disconnected recovers by re-fetching over REST (`afterSeq=`), not by replaying a WS log.
