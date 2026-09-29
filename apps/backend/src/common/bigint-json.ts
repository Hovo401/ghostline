/**
 * `Message.seq`, `ChatMember.lastReadSeq/lastDeliveredSeq` and `Chat.lastSeq`
 * are Postgres `bigint`s, which Prisma returns as native `bigint`. Neither
 * `JSON.stringify` (REST responses) nor socket.io's default parser (WS
 * payloads) can serialize a `bigint` — both throw `TypeError: Do not know
 * how to serialize a BigInt`. Patching `toJSON` once at process start makes
 * every `bigint` serialize as its decimal string form, which is exactly
 * what `z.coerce.bigint()` in `packages/contracts` expects to parse back on
 * the receiving side. Side-effect only — import for effect, before anything
 * else touches JSON serialization (see main.ts/main.worker.ts).
 */
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function toJSON(this: bigint): string {
  return this.toString();
};

export {};
