import { UserSearchQuerySchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class UserSearchQueryDto extends createZodDto(UserSearchQuerySchema) {}
