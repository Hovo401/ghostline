import { UsernameAvailabilityQuerySchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class UsernameAvailabilityDto extends createZodDto(UsernameAvailabilityQuerySchema) {}
