import { NotificationSettingsPatchSchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class NotificationSettingsPatchDto extends createZodDto(NotificationSettingsPatchSchema) {}
