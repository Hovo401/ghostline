import { PresignUploadRequestSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class PresignUploadDto extends createZodDto(PresignUploadRequestSchema) {}
