import { CompleteUploadRequestSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class CompleteUploadDto extends createZodDto(CompleteUploadRequestSchema) {}
