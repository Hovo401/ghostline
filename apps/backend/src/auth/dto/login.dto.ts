import { LoginRequestSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class LoginDto extends createZodDto(LoginRequestSchema) {}
