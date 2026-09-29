import type { Message } from "@ghostline/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentUserId } from "../auth/current-user.decorator";

import { EditMessageDto } from "./dto/edit-message.dto";
import { ListMessagesQueryDto } from "./dto/list-messages.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { MessagesService } from "./messages.service";

@Controller("messages")
@UseGuards(AccessTokenGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query() query: ListMessagesQueryDto): Promise<Message[]> {
    return this.messagesService.listMessages(userId, query);
  }

  @Post()
  send(@CurrentUserId() userId: string, @Body() dto: SendMessageDto): Promise<Message> {
    return this.messagesService.sendMessage(userId, dto);
  }

  @Patch(":id")
  edit(
    @CurrentUserId() userId: string,
    @Param("id", ParseUUIDPipe) messageId: string,
    @Body() dto: EditMessageDto,
  ): Promise<Message> {
    return this.messagesService.editMessage(userId, messageId, dto.text);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUserId() userId: string,
    @Param("id", ParseUUIDPipe) messageId: string,
  ): Promise<void> {
    return this.messagesService.deleteMessage(userId, messageId);
  }
}
