import type { Call as PrismaCall, Message as PrismaMessage } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";

import {
  MESSAGE_INCLUDE,
  computeMessageStatus,
  createCallMessageRow,
  toWireMessage,
} from "./message.util";

describe("computeMessageStatus", () => {
  it("is 'read' with no other members (Saved Messages)", () => {
    expect(computeMessageStatus({ seq: 5n, otherMembers: [], readReceiptsVisible: true })).toBe(
      "read",
    );
  });

  it("is 'sent' when the other member hasn't received it yet", () => {
    const status = computeMessageStatus({
      seq: 5n,
      otherMembers: [{ userId: "b", lastReadSeq: 3n, lastDeliveredSeq: 3n }],
      readReceiptsVisible: true,
    });
    expect(status).toBe("sent");
  });

  it("is 'delivered' once received but not yet read", () => {
    const status = computeMessageStatus({
      seq: 5n,
      otherMembers: [{ userId: "b", lastReadSeq: 3n, lastDeliveredSeq: 5n }],
      readReceiptsVisible: true,
    });
    expect(status).toBe("delivered");
  });

  it("is 'read' once every other member has read up to this seq", () => {
    const status = computeMessageStatus({
      seq: 5n,
      otherMembers: [{ userId: "b", lastReadSeq: 5n, lastDeliveredSeq: 5n }],
      readReceiptsVisible: true,
    });
    expect(status).toBe("read");
  });

  it("caps at 'delivered' when read receipts aren't mutually visible (FR-USER-08)", () => {
    const status = computeMessageStatus({
      seq: 5n,
      otherMembers: [{ userId: "b", lastReadSeq: 5n, lastDeliveredSeq: 5n }],
      readReceiptsVisible: false,
    });
    expect(status).toBe("delivered");
  });

  it("requires every other member to have read it, in a multi-member chat", () => {
    const status = computeMessageStatus({
      seq: 5n,
      otherMembers: [
        { userId: "b", lastReadSeq: 5n, lastDeliveredSeq: 5n },
        { userId: "c", lastReadSeq: 2n, lastDeliveredSeq: 5n },
      ],
      readReceiptsVisible: true,
    });
    expect(status).toBe("delivered");
  });
});

const CALL = {
  id: "call-1",
  chatId: "chat-1",
  callerId: "alice",
  calleeId: "bob",
  video: false,
  status: "CANCELLED",
  answeredAt: null,
  endedAt: new Date("2026-01-01T00:00:10.000Z"),
} as unknown as PrismaCall;

function messageRow(overrides: Partial<PrismaMessage> = {}) {
  return {
    id: "m1",
    chatId: "chat-1",
    seq: 1n,
    senderId: "alice",
    clientMessageId: "c1",
    type: "CALL",
    text: null,
    attachmentId: null,
    durationMs: null,
    waveform: null,
    replyToId: null,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    attachment: null,
    call: CALL,
    ...overrides,
  } as PrismaMessage & { attachment: null; call: PrismaCall };
}

describe("toWireMessage", () => {
  it("keeps the call info of a call row (survives history reload)", async () => {
    const wire = await toWireMessage(messageRow(), "sent", {} as StorageService);
    expect(wire.call).toEqual({ status: "cancelled", video: false, durationMs: null });
  });

  it("strips the payload of a deleted message", async () => {
    const wire = await toWireMessage(
      messageRow({ type: "TEXT", text: "secret", deletedAt: new Date() }),
      "sent",
      {} as StorageService,
    );
    expect(wire).toMatchObject({ text: null, attachment: null, attachmentId: null, call: null });
  });
});

describe("createCallMessageRow", () => {
  it("loads the call relation and marks the row read/delivered for the caller", async () => {
    const memberUpdate = vi.fn(() => Promise.resolve({}));
    const messageCreate = vi.fn(() => Promise.resolve(messageRow({ seq: 7n })));
    const tx = {
      chat: { update: vi.fn(() => Promise.resolve({ lastSeq: 7n })) },
      message: { create: messageCreate },
      chatMember: { update: memberUpdate },
    };
    const prisma = {
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    } as unknown as PrismaService;

    await createCallMessageRow(prisma, CALL);

    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ include: MESSAGE_INCLUDE }),
    );
    expect(memberUpdate).toHaveBeenCalledWith({
      where: { chatId_userId: { chatId: "chat-1", userId: "alice" } },
      data: { lastReadSeq: 7n, lastDeliveredSeq: 7n },
    });
  });
});
