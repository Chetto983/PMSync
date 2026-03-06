import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient } from '@prisma/client';

/**
 * Creates a better-auth consumer instance for NestJS.
 *
 * This instance is read-only -- it validates sessions created by the
 * Next.js auth provider via `auth.api.getSession()`.  It does NOT
 * enable emailAndPassword or hooks; those live in the Next.js instance.
 *
 * CRITICAL: session and user.additionalFields config MUST match the
 * Next.js instance exactly.  If they diverge, cookieCache validation
 * will fail silently and every request will hit the DB.
 */
export function createBetterAuthInstance(prisma: PrismaClient) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    secret: process.env.BETTER_AUTH_SECRET,
    // Mirror session config from Next.js instance exactly
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh daily
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 min
        strategy: 'compact',
      },
    },
    user: {
      additionalFields: {
        tenantId: { type: 'string', required: false, input: false },
        firstName: { type: 'string', required: false },
        lastName: { type: 'string', required: false },
        role: {
          type: 'string',
          required: false,
          defaultValue: 'member',
        },
        isActive: {
          type: 'boolean',
          required: false,
          defaultValue: true,
        },
      },
    },
  });
}
