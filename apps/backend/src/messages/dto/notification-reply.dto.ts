import { NotificationReplyBodySchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class NotificationReplyDto extends createZodDto(NotificationReplyBodySchema) {}
