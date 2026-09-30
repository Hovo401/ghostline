import { SetReactionRequestSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class SetReactionDto extends createZodDto(SetReactionRequestSchema) {}
