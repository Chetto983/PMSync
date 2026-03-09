import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createBetterAuthInstance } from './better-auth.instance';
import { BetterAuthController } from './better-auth.controller';

export const BETTER_AUTH = 'BETTER_AUTH';

/**
 * Full better-auth module — provides auth instance via DI
 * and exposes /api/auth/* endpoints for sign-up, sign-in,
 * password reset, email verification, and session management.
 *
 * The frontend createAuthClient points to this backend.
 */
@Global()
@Module({
  controllers: [BetterAuthController],
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
