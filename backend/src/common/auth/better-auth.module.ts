import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createBetterAuthInstance } from './better-auth.instance';

export const BETTER_AUTH = 'BETTER_AUTH';

/**
 * Full better-auth module — provides auth instance via DI.
 *
 * Auth HTTP routes are mounted as raw Express middleware in main.ts
 * (before NestJS body parser) via toNodeHandler.
 * Session validation uses auth.api.getSession() in BetterAuthGuard.
 */
@Global()
@Module({
  providers: [
    {
      provide: BETTER_AUTH,
      useFactory: (prisma: PrismaService) =>
        createBetterAuthInstance(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [BETTER_AUTH],
})
export class BetterAuthModule {}
