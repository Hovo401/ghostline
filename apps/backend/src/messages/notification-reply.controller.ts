import type { Message } from "@ghostline/contracts";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";

import { CurrentUserId } from "../auth/current-user.decorator";
import {
  NotificationActionGuard,
  NotificationChatId,
} from "../notifications/notification-action.guard";

import { NotificationReplyDto } from "./dto/notification-reply.dto";
import { MessagesService } from "./messages.service";

/**
 * "Ответить" typed into an Android message notification (docs/adr/0017).
 * Its own controller because `MessagesController`'s class-level
 * `AccessTokenGuard` would otherwise apply — this route is authorized by the
 * push's chat action token instead. Goes through the regular send path
 * (membership, blocks, `clientMessageId` dedup on a retried tap).
 */
@Controller("messages")
@UseGuards(NotificationActionGuard)
export class NotificationReplyController {
  constructor(private readonly messages: MessagesService) {}

  @Post("notification-reply")
  reply(
    @CurrentUserId() userId: string,
    @NotificationChatId() chatId: string,
    @Body() dto: NotificationReplyDto,
  ): Promise<Message> {
    return this.messages.sendMessage(userId, {
      chatId,
      clientMessageId: dto.clientMessageId,
      type: "text",
      text: dto.text,
    });
  }
}
