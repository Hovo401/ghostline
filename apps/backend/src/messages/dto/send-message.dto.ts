import { SendMessageRequestSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class SendMessageDto extends createZodDto(SendMessageRequestSchema) {}
