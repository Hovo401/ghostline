import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";

import { ChatEventsGateway } from "./chat-events.gateway";
import { PresenceService } from "./presence.service";
import { RealtimeGateway } from "./realtime.gateway";

@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, ChatEventsGateway, PresenceService],
  exports: [ChatEventsGateway],
})
export class RealtimeModule {}
