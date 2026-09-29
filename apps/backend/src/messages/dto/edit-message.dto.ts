import { EditMessageRequestSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class EditMessageDto extends createZodDto(EditMessageRequestSchema) {}
