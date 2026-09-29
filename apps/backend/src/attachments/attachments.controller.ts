import type {
  Attachment,
  AttachmentLimitsResponse,
  PresignPartsResponse,
  PresignUploadResponse,
} from "@ghostline/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentUserId } from "../auth/current-user.decorator";

import { AttachmentsService } from "./attachments.service";
import { CompleteUploadDto } from "./dto/complete-upload.dto";
import { PresignPartsDto } from "./dto/presign-parts.dto";
import { PresignUploadDto } from "./dto/presign-upload.dto";

@Controller("attachments")
@UseGuards(AccessTokenGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get("limits")
  limits(): AttachmentLimitsResponse {
    return this.attachmentsService.getLimits();
  }

  @Post("presign")
  presign(
    @CurrentUserId() userId: string,
    @Body() dto: PresignUploadDto,
  ): Promise<PresignUploadResponse> {
    return this.attachmentsService.presignUpload(userId, dto);
  }

  @Post(":id/parts")
  presignParts(
    @CurrentUserId() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PresignPartsDto,
  ): Promise<PresignPartsResponse> {
    return this.attachmentsService.presignParts(userId, id, dto);
  }

  @Post(":id/complete")
  complete(
    @CurrentUserId() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CompleteUploadDto,
  ): Promise<Attachment> {
    return this.attachmentsService.completeUpload(userId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@CurrentUserId() userId: string, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.attachmentsService.cancelUpload(userId, id);
  }

  @Get(":id")
  getOne(
    @CurrentUserId() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<Attachment> {
    return this.attachmentsService.getAttachment(userId, id);
  }
}
