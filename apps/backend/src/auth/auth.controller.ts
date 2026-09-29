import type { AuthTokenResponse } from "@ghostline/contracts";
import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from "@nestjs/common";

import { AppConfigService } from "../config/app-config.service";

import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
  type CookieRequest,
  type CookieResponse,
} from "./refresh-cookie.util";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<AuthTokenResponse> {
    const { refreshToken, ...body } = await this.authService.register(dto);
    setRefreshCookie(res, this.config, refreshToken);
    return body;
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<AuthTokenResponse> {
    const { refreshToken, ...body } = await this.authService.login(dto);
    setRefreshCookie(res, this.config, refreshToken);
    return body;
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<AuthTokenResponse> {
    const presented = readRefreshCookie(req);
    if (!presented) {
      throw new UnauthorizedException("missing refresh token");
    }
    const { refreshToken, ...body } = await this.authService.refresh(presented);
    setRefreshCookie(res, this.config, refreshToken);
    return body;
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<void> {
    const presented = readRefreshCookie(req);
    await this.authService.logout(presented);
    clearRefreshCookie(res, this.config);
  }
}
