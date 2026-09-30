import type { ActiveCall, Call, CallJoin, StartCallBody } from "@ghostline/contracts";
import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Call as PrismaCall, CallStatus as PrismaCallStatus } from "@prisma/client";
import type { Queue } from "bullmq";
import type Redis from "ioredis";
import { AccessToken, RoomServiceClient, WebhookReceiver } from "livekit-server-sdk";

import { AppConfigService } from "../config/app-config.service";
import { CALLS_QUEUE, type CallRingTimeoutJobData } from "../jobs/calls.processor";
import { MessagesService } from "../messages/messages.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { ChatEventsGateway } from "../realtime/chat-events.gateway";
import { REDIS_CLIENT } from "../redis/redis.module";
import { UsersService } from "../users/users.service";

import { busyLockKey, roomNameForCall, toWireCall, verifyDeclineToken } from "./call.util";

const RING_TIMEOUT_MS = 45_000;
/**
 * The browser can't play a long ringtone in the background, so the SW
 * re-rings (via `tag`+`renotify`) on every repeated `call:incoming` push
 * while the call is still `RINGING` — a flat set of delayed, idempotent
 * jobs on the same queue as the ring-timeout, not a BullMQ repeat
 * scheduler (see `CallRingTimeoutProcessor`).
 */
const RING_REPEAT_INTERVAL_MS = 4_000;
const RING_REPEAT_COUNT = 10;
const BUSY_LOCK_RING_TTL_MS = RING_TIMEOUT_MS + 5_000;
const BUSY_LOCK_ACTIVE_TTL_MS = 4 * 60 * 60 * 1000; // 4h, matches the join token TTL below.
const JOIN_TOKEN_TTL = "2h";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_STARTS = 8;

/** Terminal statuses that get a history row in the chat (message.util.ts's `MessageCallInfoSchema`). */
const MESSAGE_WORTHY_STATUSES = new Set<PrismaCallStatus>([
  "ENDED",
  "MISSED",
  "DECLINED",
  "CANCELLED",
]);

/**
 * 1:1 call state machine (docs/adr/0009). Every transition away from
 * `RINGING`/`ACTIVE` uses `updateMany` guarded by the expected current
 * status, so a second caller (a retried request, a racing webhook, the
 * worker's ring-timeout job) sees `count === 0` and treats it as an
 * already-applied no-op rather than erroring — see each method below.
 */
@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly messages: MessagesService,
    private readonly notifications: NotificationsService,
    private readonly events: ChatEventsGateway,
    private readonly config: AppConfigService,
    @InjectQueue(CALLS_QUEUE) private readonly callsQueue: Queue<CallRingTimeoutJobData>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * FR-CALL-01/02: only in direct chats, blocked pairs can't call, busy/glare
   * handled before a row is written. Returns a `CallJoin` — the caller mints
   * a LiveKit token and can connect immediately while it's still ringing, so
   * by the time the callee answers, the caller is already in the room.
   */
  async start(userId: string, dto: StartCallBody): Promise<CallJoin> {
    await this.assertRateLimit(userId);

    const membership = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: dto.chatId, userId } },
    });
    if (!membership) throw new NotFoundException("chat not found");

    const chat = await this.prisma.chat.findUniqueOrThrow({ where: { id: dto.chatId } });
    if (chat.type !== "DIRECT") {
      throw new BadRequestException("calls are only supported in direct chats");
    }
    const otherMember = await this.prisma.chatMember.findFirst({
      where: { chatId: dto.chatId, userId: { not: userId } },
    });
    if (!otherMember) throw new BadRequestException("no one to call in this chat");
    const calleeId = otherMember.userId;

    if (await this.users.isBlockedEitherWay(userId, calleeId)) {
      throw new ForbiddenException("can't call a blocked user");
    }

    // Glare: the callee is already ringing us in this same chat — accept
    // that call (on their behalf, as its legitimate callee) instead of
    // creating a second, competing one, so both parties land in one room.
    const glare = await this.prisma.call.findFirst({
      where: { chatId: dto.chatId, status: "RINGING", callerId: calleeId, calleeId: userId },
      orderBy: { createdAt: "desc" },
    });
    if (glare) return this.accept(userId, glare.id);

    const [callerBusy, calleeBusy] = await Promise.all([
      this.redis.get(busyLockKey(userId)),
      this.redis.get(busyLockKey(calleeId)),
    ]);
    if (callerBusy || calleeBusy) {
      throw new ConflictException("busy");
    }

    const call = await this.prisma.call.create({
      data: { chatId: dto.chatId, callerId: userId, calleeId, video: dto.video, status: "RINGING" },
    });

    const [callerLocked, calleeLocked] = await Promise.all([
      this.redis.set(busyLockKey(userId), call.id, "PX", BUSY_LOCK_RING_TTL_MS, "NX"),
      this.redis.set(busyLockKey(calleeId), call.id, "PX", BUSY_LOCK_RING_TTL_MS, "NX"),
    ]);
    if (callerLocked !== "OK" || calleeLocked !== "OK") {
      // Someone else grabbed a lock in the tiny window between the check
      // above and here — extremely unlikely, but don't leave a stray
      // RINGING row or a lock this call doesn't actually hold.
      await Promise.all([
        this.releaseLockIfOwned(userId, call.id),
        this.releaseLockIfOwned(calleeId, call.id),
      ]);
      await this.prisma.call.delete({ where: { id: call.id } });
      throw new ConflictException("busy");
    }

    try {
      await this.callsQueue.add(
        "ring-timeout",
        { callId: call.id },
        { delay: RING_TIMEOUT_MS, jobId: `ring-timeout-${call.id}` },
      );
      await Promise.all(
        Array.from({ length: RING_REPEAT_COUNT }, (_, i) => {
          const attempt = i + 1;
          return this.callsQueue.add(
            "ring-repeat",
            { callId: call.id },
            {
              delay: RING_REPEAT_INTERVAL_MS * attempt,
              jobId: `ring-repeat-${call.id}-${String(attempt)}`,
            },
          );
        }),
      );

      const wireCall = toWireCall(call);
      this.events.server.to(`user:${calleeId}`).emit("call:incoming", wireCall);
      this.events.server.to(`user:${userId}`).emit("call:updated", wireCall);

      const caller = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { displayName: true },
      });
      await this.notifications.notifyCallIncoming(wireCall, caller.displayName);

      return await this.buildJoin(call, userId);
    } catch (err) {
      await this.prisma.call.updateMany({
        where: { id: call.id, status: "RINGING" },
        data: { status: "FAILED", endedAt: new Date() },
      });
      await Promise.all([
        this.releaseLockIfOwned(userId, call.id),
        this.releaseLockIfOwned(calleeId, call.id),
      ]);
      throw err;
    }
  }

  /**
   * The reconnect-on-load flow: whatever non-terminal call this user has.
   * A still-`RINGING` call where the requester is the callee gets no
   * LiveKit token (they haven't answered — minting one would let their own
   * unopened tab "join" an empty room), just the call so the frontend can
   * re-show the incoming-call screen. Every other case (the caller of a
   * ringing call, either party of an active one) gets a full join.
   */
  async getActive(userId: string): Promise<ActiveCall | null> {
    const call = await this.prisma.call.findFirst({
      where: {
        status: { in: ["RINGING", "ACTIVE"] },
        OR: [{ callerId: userId }, { calleeId: userId }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (!call) return null;

    if (call.status === "RINGING" && call.calleeId === userId) {
      return { call: toWireCall(call), livekitUrl: this.config.livekit.url, token: null };
    }
    return this.buildJoin(call, userId);
  }

  async accept(userId: string, callId: string): Promise<CallJoin> {
    const call = await this.getCallOr404(callId);
    if (call.calleeId !== userId) throw new ForbiddenException("only the callee can accept");

    if (call.status === "RINGING") {
      const result = await this.prisma.call.updateMany({
        where: { id: callId, status: "RINGING" },
        data: { status: "ACTIVE", answeredAt: new Date() },
      });
      if (result.count > 0) {
        await Promise.all([
          this.redis.set(busyLockKey(call.callerId), call.id, "PX", BUSY_LOCK_ACTIVE_TTL_MS),
          this.redis.set(busyLockKey(call.calleeId), call.id, "PX", BUSY_LOCK_ACTIVE_TTL_MS),
        ]);
        const fresh = await this.prisma.call.findUniqueOrThrow({ where: { id: callId } });
        const wireCall = toWireCall(fresh);
        // Every socket in the callee's own rooms (other tabs/devices) learns
        // it was answered here and stops ringing; the caller learns it was picked up.
        this.events.server.to(`user:${call.calleeId}`).emit("call:updated", wireCall);
        this.events.server.to(`user:${call.callerId}`).emit("call:updated", wireCall);
        await this.notifications.notifyCallClosed(wireCall, "answered-elsewhere");
      }
    } else if (call.status !== "ACTIVE") {
      throw new ConflictException(`call is ${call.status.toLowerCase()}, can't be accepted`);
    }

    const fresh = await this.prisma.call.findUniqueOrThrow({ where: { id: callId } });
    return this.buildJoin(fresh, userId);
  }

  /** Reconnect/reload while `ACTIVE` — same room, a fresh token, no status change. */
  async token(userId: string, callId: string): Promise<CallJoin> {
    const call = await this.getCallOr404(callId);
    if (call.callerId !== userId && call.calleeId !== userId) throw new ForbiddenException();
    if (call.status !== "ACTIVE") throw new ConflictException("call is not active");
    return this.buildJoin(call, userId);
  }

  async decline(userId: string, callId: string): Promise<Call> {
    const call = await this.getCallOr404(callId);
    if (call.calleeId !== userId) throw new ForbiddenException("only the callee can decline");
    return this.finalizeTerminal(call, "DECLINED", ["RINGING"]);
  }

  /** No access token available (a service worker notification action) — a signed, call-scoped token stands in for one. */
  async declineWithToken(callId: string, token: string): Promise<Call> {
    const call = await this.getCallOr404(callId);
    if (!verifyDeclineToken(this.config.jwt.accessSecret, callId, token)) {
      throw new ForbiddenException("invalid decline token");
    }
    return this.finalizeTerminal(call, "DECLINED", ["RINGING"]);
  }

  async cancel(userId: string, callId: string): Promise<Call> {
    const call = await this.getCallOr404(callId);
    if (call.callerId !== userId) throw new ForbiddenException("only the caller can cancel");
    return this.finalizeTerminal(call, "CANCELLED", ["RINGING"]);
  }

  /**
   * On an `ACTIVE` call this always means "end it". On a still-`RINGING`
   * call, who hangs up matters: the caller giving up before an answer is a
   * cancel, the callee hanging up before answering is the same as a
   * decline — only "answered then someone left" is a true `ENDED`.
   */
  async hangup(userId: string, callId: string): Promise<Call> {
    const call = await this.getCallOr404(callId);
    if (call.callerId !== userId && call.calleeId !== userId) throw new ForbiddenException();

    if (call.status === "RINGING") {
      const newStatus = userId === call.callerId ? "CANCELLED" : "DECLINED";
      return this.finalizeTerminal(call, newStatus, ["RINGING"]);
    }
    return this.finalizeTerminal(call, "ENDED", ["ACTIVE"]);
  }

  /**
   * LiveKit's server-to-server webhook (`WebhookReceiver` verifies the
   * signature) — belt-and-suspenders alongside the BullMQ ring-timeout job:
   * a participant leaving (or the room finishing) an `ACTIVE` 1:1 call ends
   * it here even if the client never called `/hangup` (crash, lost network,
   * tab closed).
   */
  async handleWebhook(rawBody: string, authHeader: string | undefined): Promise<void> {
    const receiver = new WebhookReceiver(this.config.livekit.apiKey, this.config.livekit.apiSecret);
    const event = await receiver.receive(rawBody, authHeader);
    await this.applyWebhookEvent(event.event, event.room?.name);
  }

  /**
   * Split out from `handleWebhook` so `CallsService.spec.ts` can exercise
   * the actual transition logic without fabricating a signed LiveKit
   * webhook JWT — signature verification belongs to `handleWebhook`
   * (transport concern), this is the business logic it verifies for.
   */
  async applyWebhookEvent(eventName: string, roomName: string | undefined): Promise<void> {
    const callId = callIdFromRoomName(roomName);
    if (!callId) return;
    if (eventName !== "participant_left" && eventName !== "room_finished") return;

    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) return;
    if (call.status === "ACTIVE") {
      await this.finalizeTerminal(call, "ENDED", ["ACTIVE"]);
    }
  }

  private async getCallOr404(callId: string): Promise<PrismaCall> {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException("call not found");
    return call;
  }

  private async buildJoin(call: PrismaCall, userId: string): Promise<CallJoin> {
    const token = await this.mintToken(call.id, userId);
    return { call: toWireCall(call), livekitUrl: this.config.livekit.url, token };
  }

  private async mintToken(callId: string, userId: string): Promise<string> {
    const at = new AccessToken(this.config.livekit.apiKey, this.config.livekit.apiSecret, {
      identity: userId,
      ttl: JOIN_TOKEN_TTL,
    });
    at.addGrant({
      roomJoin: true,
      room: roomNameForCall(callId),
      canPublish: true,
      canSubscribe: true,
    });
    return at.toJwt();
  }

  private async finalizeTerminal(
    call: PrismaCall,
    newStatus: PrismaCallStatus,
    fromStatuses: PrismaCallStatus[],
  ): Promise<Call> {
    const result = await this.prisma.call.updateMany({
      where: { id: call.id, status: { in: fromStatuses } },
      data: { status: newStatus, endedAt: new Date() },
    });
    const fresh = await this.prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    if (result.count === 0) {
      // Already resolved (by the other party, the webhook, or the
      // ring-timeout job) — idempotent no-op, just report the real state.
      return toWireCall(fresh);
    }

    await Promise.all([
      this.releaseLockIfOwned(fresh.callerId, fresh.id),
      this.releaseLockIfOwned(fresh.calleeId, fresh.id),
    ]);
    await this.deleteRoomBestEffort(fresh.id);

    const wireCall = toWireCall(fresh);
    this.events.server.to(`user:${fresh.callerId}`).emit("call:updated", wireCall);
    this.events.server.to(`user:${fresh.calleeId}`).emit("call:updated", wireCall);

    if (MESSAGE_WORTHY_STATUSES.has(newStatus)) {
      await this.messages.createCallMessage(fresh);
    }

    if (newStatus === "MISSED") {
      const caller = await this.prisma.user.findUniqueOrThrow({
        where: { id: fresh.callerId },
        select: { displayName: true },
      });
      await this.notifications.notifyCallMissed(wireCall, caller.displayName);
    } else {
      await this.notifications.notifyCallClosed(wireCall, "ended");
    }

    return wireCall;
  }

  private async releaseLockIfOwned(userId: string, callId: string): Promise<void> {
    const current = await this.redis.get(busyLockKey(userId));
    if (current === callId) await this.redis.del(busyLockKey(userId));
  }

  /** LiveKit's own `empty_timeout`/webhook clean up regardless — this just hangs up promptly. */
  private async deleteRoomBestEffort(callId: string): Promise<void> {
    try {
      const rooms = new RoomServiceClient(
        this.config.livekit.apiUrl,
        this.config.livekit.apiKey,
        this.config.livekit.apiSecret,
      );
      await rooms.deleteRoom(roomNameForCall(callId));
    } catch {
      // best effort only — see above.
    }
  }

  private async assertRateLimit(userId: string): Promise<void> {
    const key = `call:rate:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.pexpire(key, RATE_LIMIT_WINDOW_MS);
    if (count > RATE_LIMIT_MAX_STARTS) {
      throw new HttpException("too many call attempts, slow down", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

/** `call:<uuid>` (see `roomNameForCall`) → `<uuid>`, or `null` for anything else (other room kinds don't exist yet). */
function callIdFromRoomName(roomName: string | undefined): string | null {
  if (!roomName?.startsWith("call:")) return null;
  return roomName.slice("call:".length);
}
