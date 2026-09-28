import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { StorageModule } from "../storage/storage.module";

import { AccessTokenGuard } from "./access-token.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";

/**
 * `JwtModule.register({})` on purpose: access and refresh tokens use
 * different secrets (`AppConfigService.jwt`), so `TokenService` passes the
 * secret per `sign`/`verify` call instead of one module-wide default.
 *
 * Exports `TokenService` and `AccessTokenGuard` — `UsersModule` (`/me`) and
 * `RealtimeModule` (handshake auth) both need them and import this module
 * rather than re-implementing JWT verification.
 */
@Module({
  imports: [JwtModule.register({}), StorageModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, AccessTokenGuard],
  exports: [TokenService, AccessTokenGuard],
})
export class AuthModule {}
