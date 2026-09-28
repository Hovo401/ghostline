import { Global, Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service";

/**
 * Global on purpose: almost every feature module needs `PrismaService`,
 * and re-importing it everywhere adds noise without adding safety —
 * `PrismaService` has no state that benefits from per-module scoping.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
