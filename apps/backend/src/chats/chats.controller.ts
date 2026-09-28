import type { ChatListItem } from "@ghostline/contracts";
import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Body,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentUserId } from "../auth/current-user.decorator";

import { ChatsService } from "./chats.service";
import { MarkReadDto } from "./dto/mark-read.dto";
import { MuteChatDto } from "./dto/mute-chat.dto";
import { OpenDirectDto } from "./dto/open-direct.dto";

@Controller("chats")
@UseGuards(AccessTokenGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  list(@CurrentUserId() userId: string): Promise<ChatListItem[]> {
    return this.chatsService.listChats(userId);
  }

  @Post("open-direct")
  openDirect(@CurrentUserId() userId: string, @Body() dto: OpenDirectDto): Promise<ChatListItem> {
    return this.chatsService.openDirect(userId, dto.userId);
  }

  @Post(":id/read")
  @HttpCode(204)
  markRead(
    @CurrentUserId() userId: string,
    @Param("id", ParseUUIDPipe) chatId: string,
    @Body() dto: MarkReadDto,
  ): Promise<void> {
    return this.chatsService.markRead(userId, chatId, dto.upToSeq);
  }

  @Patch(":id/mute")
  @HttpCode(204)
  mute(
    @CurrentUserId() userId: string,
    @Param("id", ParseUUIDPipe) chatId: string,
    @Body() dto: MuteChatDto,
  ): Promise<void> {
    return this.chatsService.setMuted(userId, chatId, dto.muted);
  }
}
