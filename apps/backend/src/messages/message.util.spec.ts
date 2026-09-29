import { describe, expect, it } from "vitest";

import { computeMessageStatus } from "./message.util";

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
