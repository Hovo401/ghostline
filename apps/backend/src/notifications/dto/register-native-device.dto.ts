import { RegisterNativeDeviceBodySchema } from "@ghostline/contracts";
import { createZodDto } from "nestjs-zod";

export class RegisterNativeDeviceDto extends createZodDto(RegisterNativeDeviceBodySchema) {}
