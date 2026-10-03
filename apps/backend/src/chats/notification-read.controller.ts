import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";

import { CurrentUserId } from "../auth/current-user.decorator";
import {
  NotificationActionGuard,
  NotificationChatId,
} from "../notifications/notification-action.guard";

import { ChatsService } from "./chats.service";
import { MarkReadDto } from "./dto/mark-read.dto";

/**
 * "Прочитано" on an Android message notification (docs/adr/0017) — same
 * effect as `POST /chats/:id/read`, authorized by the push's chat action
 * token instead of an access token (see `NotificationReplyController`).
 */
@Controller("chats")
@UseGuards(NotificationActionGuard)
export class NotificationReadController {
  constructor(private readonly chats: ChatsService) {}

  @Post("notification-read")
  @HttpCode(204)
  markRead(
    @CurrentUserId() userId: string,
    @NotificationChatId() chatId: string,
    @Body() dto: MarkReadDto,
  ): Promise<void> {
    return this.chats.markRead(userId, chatId, dto.upToSeq);
  }
}
