import { OpenDirectRequestSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class OpenDirectDto extends createZodDto(OpenDirectRequestSchema) {}
