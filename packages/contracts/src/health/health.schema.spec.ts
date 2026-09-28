import { describe, expect, it } from "vitest";

import { HealthResponseSchema } from "./health.schema";

describe("HealthResponseSchema", () => {
  it("accepts a well-formed healthy response", () => {
    const result = HealthResponseSchema.safeParse({
      status: "ok",
      info: { database: { status: "ok" } },
      details: { database: { status: "ok" } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown status value", () => {
    const result = HealthResponseSchema.safeParse({
      status: "degraded",
      info: {},
      details: {},
    });
    expect(result.success).toBe(false);
  });
});
