import { z } from "zod";

/**
 * Response shape for `GET /api/v1/health` and `/ready`.
 * This is the reference example for how a contract in this package is
 * structured: one zod schema, one inferred type, both exported.
 */
export const HealthCheckStatusSchema = z.enum(["ok", "error"]);
export type HealthCheckStatus = z.infer<typeof HealthCheckStatusSchema>;

export const HealthResponseSchema = z.object({
  status: HealthCheckStatusSchema,
  info: z.record(z.string(), z.object({ status: HealthCheckStatusSchema })),
  error: z.record(z.string(), z.object({ status: HealthCheckStatusSchema })).optional(),
  details: z.record(z.string(), z.object({ status: HealthCheckStatusSchema })),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
