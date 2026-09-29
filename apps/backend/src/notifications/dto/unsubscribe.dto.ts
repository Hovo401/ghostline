import { PushSubscriptionBodySchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

/** `DELETE /notifications/subscriptions` body — just enough to identify which device's subscription to drop. */
export class UnsubscribeDto extends createZodDto(
  PushSubscriptionBodySchema.pick({ endpoint: true }),
) {}
