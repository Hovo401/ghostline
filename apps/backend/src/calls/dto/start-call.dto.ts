import { StartCallBodySchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class StartCallDto extends createZodDto(StartCallBodySchema) {}
