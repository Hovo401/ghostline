import { PushSubscriptionBodySchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class PushSubscriptionDto extends createZodDto(PushSubscriptionBodySchema) {}
