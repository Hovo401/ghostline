import type {
  MeResponse,
  UsernameAvailabilityResponse,
  UserSearchResponse,
} from "@ghostline/contracts";
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentUserId } from "../auth/current-user.decorator";

import { UserSearchQueryDto } from "./dto/user-search.dto";
import { UsernameAvailabilityDto } from "./dto/username-availability.dto";
import { UsersService } from "./users.service";

/**
 * `GET /me` and `GET /users/availability` share this controller so `/me`
 * can sit at the top level (matching REQUIREMENTS.md's `/api/v1/me...`
 * routes) without `UsersModule` needing a second controller.
 */
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @UseGuards(AccessTokenGuard)
  getMe(@CurrentUserId() userId: string): Promise<MeResponse> {
    return this.usersService.getMe(userId);
  }

  @Get("users/availability")
  checkAvailability(
    @Query() query: UsernameAvailabilityDto,
  ): Promise<UsernameAvailabilityResponse> {
    return this.usersService.checkAvailability(query.username);
  }

  @Get("users/search")
  @UseGuards(AccessTokenGuard)
  search(
    @CurrentUserId() viewerId: string,
    @Query() query: UserSearchQueryDto,
  ): Promise<UserSearchResponse> {
    return this.usersService.searchUsers(viewerId, query.q);
  }

  @Post("users/:id/block")
  @UseGuards(AccessTokenGuard)
  @HttpCode(204)
  block(
    @CurrentUserId() userId: string,
    @Param("id", ParseUUIDPipe) blockedId: string,
  ): Promise<void> {
    return this.usersService.blockUser(userId, blockedId);
  }

  @Delete("users/:id/block")
  @UseGuards(AccessTokenGuard)
  @HttpCode(204)
  unblock(
    @CurrentUserId() userId: string,
    @Param("id", ParseUUIDPipe) blockedId: string,
  ): Promise<void> {
    return this.usersService.unblockUser(userId, blockedId);
  }
}
