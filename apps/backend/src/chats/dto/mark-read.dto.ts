import { MarkReadRequestSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class MarkReadDto extends createZodDto(MarkReadRequestSchema) {}
