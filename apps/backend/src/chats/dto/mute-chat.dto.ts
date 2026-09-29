import { MuteChatRequestSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class MuteChatDto extends createZodDto(MuteChatRequestSchema) {}
