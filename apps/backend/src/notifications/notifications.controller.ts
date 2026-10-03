import { NotificationTestKindSchema, type NotificationSettings } from "@ghostline/contracts";
import {
  BadRequestException,
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
  Req,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentSessionId, CurrentUserId } from "../auth/current-user.decorator";

import { NotificationSettingsPatchDto } from "./dto/notification-settings-patch.dto";
import { PushSubscriptionDto } from "./dto/push-subscription.dto";
import { RegisterNativeDeviceDto } from "./dto/register-native-device.dto";
import { UnsubscribeDto } from "./dto/unsubscribe.dto";
import { NotificationsService } from "./notifications.service";

/** No `@types/express` in this project (see auth/refresh-cookie.util.ts) — narrow `@Req()` to the one header this controller reads. */
interface UserAgentRequest {
  headers: { "user-agent"?: string };
}

@Controller("notifications")
@UseGuards(AccessTokenGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get("vapid-key")
  vapidKey(): { publicKey: string } {
    return { publicKey: this.notifications.getVapidPublicKey() };
  }

  @Post("subscriptions")
  @HttpCode(204)
  subscribe(
    @CurrentUserId() userId: string,
    @Body() dto: PushSubscriptionDto,
    @Req() req: UserAgentRequest,
  ): Promise<void> {
    return this.notifications.subscribe(userId, dto, req.headers["user-agent"]);
  }

  @Delete("subscriptions")
  @HttpCode(204)
  unsubscribe(@CurrentUserId() userId: string, @Body() dto: UnsubscribeDto): Promise<void> {
    return this.notifications.unsubscribe(userId, dto.endpoint);
  }

  @Post("native-devices")
  @HttpCode(204)
  registerNativeDevice(
    @CurrentUserId() userId: string,
    @CurrentSessionId() sessionId: string,
    @Body() dto: RegisterNativeDeviceDto,
  ): Promise<void> {
    return this.notifications.registerNativeDevice(userId, sessionId, dto);
  }

  @Delete("native-devices/:deviceId")
  @HttpCode(204)
  unregisterNativeDevice(
    @CurrentUserId() userId: string,
    @Param("deviceId", ParseUUIDPipe) deviceId: string,
  ): Promise<void> {
    return this.notifications.unregisterNativeDevice(userId, deviceId);
  }

  @Post("test")
  @HttpCode(204)
  sendTest(@CurrentUserId() userId: string, @Query("kind") kind?: string): Promise<void> {
    const parsed = NotificationTestKindSchema.optional().safeParse(kind);
    if (!parsed.success) throw new BadRequestException("kind must be message or call");
    return this.notifications.sendTest(userId, parsed.data);
  }

  @Get("settings")
  getSettings(@CurrentUserId() userId: string): Promise<NotificationSettings> {
    return this.notifications.getSettings(userId);
  }

  @Patch("settings")
  updateSettings(
    @CurrentUserId() userId: string,
    @Body() dto: NotificationSettingsPatchDto,
  ): Promise<NotificationSettings> {
    return this.notifications.updateSettings(userId, dto);
  }
}
