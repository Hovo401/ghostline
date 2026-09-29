import { UpdateMeRequestSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class UpdateMeDto extends createZodDto(UpdateMeRequestSchema) {}
