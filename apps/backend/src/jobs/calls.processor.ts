import { randomUUID } from "node:crypto";

import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job, Queue } from "bullmq";

import { toWireCall } from "../calls/call.util";
import { resolveMessageStatus, toWireMessage } from "../messages/message.util";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeEmitter } from "../realtime/realtime-emitter";
import { StorageService } from "../storage/storage.service";

import { NOTIFICATIONS_QUEUE, type NotificationJobData } from "./notifications.processor";

export const CALLS_QUEUE = "calls";

export interface CallRingTimeoutJobData {
  callId: string;
}

/**
 * Belt-and-suspenders ring timeout (docs/adr/0009): `CallsService.start`
 * enqueues this with a 45s delay. If the call is still `RINGING` when it
 * runs, nobody answered — flip it to `MISSED`, write the history row, and
 * push both `call:updated` (stop ringing everywhere) and a `call:missed`
 * notification. A call already resolved (answered/declined/cancelled by
 * then) makes this a no-op — the `updateMany` guard is what makes that
 * idempotent against the API process's own transitions racing this job.
 *
 * Runs in the worker process (`main.worker.ts`), which binds no Socket.IO
 * server — `RealtimeEmitter` (redis-emitter) stands in for
 * `ChatEventsGateway.server` here (see its docblock).
 */
@Processor(CALLS_QUEUE)
export class CallRingTimeoutProcessor extends WorkerHost {
  private readonly logger = new Logger(CallRingTimeoutProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeEmitter,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue<NotificationJobData>,
  ) {
    super();
  }

  async process(job: Job<CallRingTimeoutJobData>): Promise<void> {
    const { callId } = job.data;

    const result = await this.prisma.call.updateMany({
      where: { id: callId, status: "RINGING" },
      data: { status: "MISSED", endedAt: new Date() },
    });
    if (result.count === 0) return; // already answered/declined/cancelled elsewhere.

    const call = await this.prisma.call.findUniqueOrThrow({ where: { id: callId } });
    this.logger.debug(`call ${callId} timed out unanswered — marked MISSED`);

    // Busy locks were set with a TTL covering the ring window (see
    // CallsService.start) — they expire on their own; nothing to release
    // here.

    const created = await this.prisma.$transaction(async (tx) => {
      const updatedChat = await tx.chat.update({
        where: { id: call.chatId },
        data: { lastSeq: { increment: 1 }, lastMessageAt: new Date() },
      });
      return tx.message.create({
        data: {
          chatId: call.chatId,
          seq: updatedChat.lastSeq,
          senderId: call.callerId,
          clientMessageId: randomUUID(),
          type: "CALL",
          callId: call.id,
        },
        include: { attachment: true },
      });
    });

    const wireCall = toWireCall(call);
    const wireMessage = await toWireMessage(
      { ...created, call },
      await resolveMessageStatus(this.prisma, created),
      this.storage,
    );

    this.realtime.emitCallUpdated(call.callerId, wireCall);
    this.realtime.emitCallUpdated(call.calleeId, wireCall);
    this.realtime.emitMessageNew(call.callerId, wireMessage);
    this.realtime.emitMessageNew(call.calleeId, wireMessage);

    const caller = await this.prisma.user.findUniqueOrThrow({
      where: { id: call.callerId },
      select: { displayName: true },
    });
    await this.notifications.add("push", {
      userId: call.calleeId,
      payload: { kind: "call:missed", call: wireCall, callerName: caller.displayName },
    });
  }
}
