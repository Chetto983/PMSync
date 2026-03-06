import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createBetterAuthInstance } from './better-auth.instance';

export const BETTER_AUTH = 'BETTER_AUTH';

/**
 * Provides the better-auth consumer instance via NestJS DI.
 *
 * Import this module wherever you need to validate better-auth sessions.
 * Inject with `@Inject(BETTER_AUTH)`.
 *
 * The old AuthModule is NOT touched -- both coexist until Phase 52
 * replaces the guards.
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
