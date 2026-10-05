import { ActiveCallQuerySchema, CallEndpointBodySchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class CallEndpointDto extends createZodDto(CallEndpointBodySchema) {}
export class ActiveCallQueryDto extends createZodDto(ActiveCallQuerySchema) {}
