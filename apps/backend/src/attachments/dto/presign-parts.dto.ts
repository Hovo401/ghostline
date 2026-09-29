import { PresignPartsRequestSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class PresignPartsDto extends createZodDto(PresignPartsRequestSchema) {}
