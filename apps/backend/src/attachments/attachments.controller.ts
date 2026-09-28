import type { Attachment, PresignUploadResponse } from "@ghostline/contracts";
import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentUserId } from "../auth/current-user.decorator";

import { AttachmentsService } from "./attachments.service";
import { CompleteUploadDto } from "./dto/complete-upload.dto";
import { PresignUploadDto } from "./dto/presign-upload.dto";

@Controller("attachments")
@UseGuards(AccessTokenGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post("presign")
  presign(
    @CurrentUserId() userId: string,
    @Body() dto: PresignUploadDto,
  ): Promise<PresignUploadResponse> {
    return this.attachmentsService.presignUpload(userId, dto);
  }

  @Post(":id/complete")
  complete(
    @CurrentUserId() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CompleteUploadDto,
  ): Promise<Attachment> {
    return this.attachmentsService.completeUpload(userId, id, dto);
  }
}
