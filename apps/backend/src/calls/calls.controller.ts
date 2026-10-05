import type { ActiveCall, Call, CallJoin } from "@ghostline/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentUserId } from "../auth/current-user.decorator";
import { TokenService } from "../auth/token.service";

import { CallsService } from "./calls.service";
import { ActiveCallQueryDto, CallEndpointDto } from "./dto/call-endpoint.dto";
import { StartCallDto } from "./dto/start-call.dto";

/** No `@types/express` in this project (see auth/refresh-cookie.util.ts) — narrow shapes for the two routes below. */
interface AuthHeaderRequest {
  headers: { authorization?: string };
}
type RawWebhookRequest = RawBodyRequest<AuthHeaderRequest>;

@Controller("calls")
export class CallsController {
  constructor(
    private readonly calls: CallsService,
    private readonly tokens: TokenService,
  ) {}

  @Post()
  @UseGuards(AccessTokenGuard)
  start(@CurrentUserId() userId: string, @Body() dto: StartCallDto): Promise<CallJoin> {
    return this.calls.start(userId, dto);
  }

  @Get("active")
  @UseGuards(AccessTokenGuard)
  active(
    @CurrentUserId() userId: string,
    @Query() query: ActiveCallQueryDto,
  ): Promise<ActiveCall | null> {
    return this.calls.getActive(userId, query.endpointId);
  }

  @Post(":id/accept")
  @UseGuards(AccessTokenGuard)
  accept(
    @CurrentUserId() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CallEndpointDto,
  ): Promise<CallJoin> {
    return this.calls.accept(userId, id, dto.endpointId);
  }

  @Post(":id/token")
  @UseGuards(AccessTokenGuard)
  token(
    @CurrentUserId() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CallEndpointDto,
  ): Promise<CallJoin> {
    return this.calls.token(userId, id, dto.endpointId);
  }

  @Post(":id/cancel")
  @UseGuards(AccessTokenGuard)
  cancel(@CurrentUserId() userId: string, @Param("id", ParseUUIDPipe) id: string): Promise<Call> {
    return this.calls.cancel(userId, id);
  }

  @Post(":id/hangup")
  @UseGuards(AccessTokenGuard)
  hangup(@CurrentUserId() userId: string, @Param("id", ParseUUIDPipe) id: string): Promise<Call> {
    return this.calls.hangup(userId, id);
  }

  /**
   * The one route in this controller that isn't behind `AccessTokenGuard`:
   * a service worker notification action has no logged-in tab to read an
   * access token from, so `?t=` (an HMAC over the call id, see
   * `call.util.ts`) authorizes it instead. A normal in-app decline still
   * works the usual way, via the `Authorization` header.
   */
  @Post(":id/decline")
  decline(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("t") token: string | undefined,
    @Req() req: AuthHeaderRequest,
  ): Promise<Call> {
    if (token) {
      return this.calls.declineWithToken(id, token);
    }
    const [scheme, raw] = (req.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !raw) {
      throw new UnauthorizedException("missing access token");
    }
    const userId = this.tokens.verifyAccessToken(raw).sub;
    return this.calls.decline(userId, id);
  }

  /** LiveKit → backend server-to-server webhook — signature-verified inside `CallsService.handleWebhook`, not by a guard. */
  @Post("livekit-webhook")
  @HttpCode(200)
  webhook(@Req() req: RawWebhookRequest): Promise<void> {
    return this.calls.handleWebhook(req.rawBody?.toString("utf8") ?? "", req.headers.authorization);
  }
}
