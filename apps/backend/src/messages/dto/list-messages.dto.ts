import { ListMessagesQuerySchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class ListMessagesQueryDto extends createZodDto(ListMessagesQuerySchema) {}
