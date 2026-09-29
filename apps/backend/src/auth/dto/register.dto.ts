import { RegisterRequestSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class RegisterDto extends createZodDto(RegisterRequestSchema) {}
