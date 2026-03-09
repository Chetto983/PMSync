import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import type { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

/**
 * Check password against HIBP k-anonymity API.
 * Fail-open: on error, allow the password.
 */
async function checkHIBP(
  password: string,
  threshold = 3,
  timeoutMs = 3000,
): Promise<{ breached: boolean; count: number }> {
  try {
    const sha1 = createHash('sha1')
      .update(password)
      .digest('hex')
      .toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: { 'Add-Padding': 'true' },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);

    if (!response.ok) return { breached: false, count: 0 };

    const text = await response.text();
    for (const line of text.split('\n')) {
      const [hashSuffix, countStr] = line.trim().split(':');
      if (hashSuffix === suffix) {
        const count = parseInt(countStr, 10);
        return { breached: count >= threshold, count };
      }
    }
    return { breached: false, count: 0 };
  } catch {
    return { breached: false, count: 0 };
  }
}

/**
 * Creates the full better-auth instance for NestJS.
 *
 * This is the SINGLE source of truth for auth — it handles sign-up,
 * sign-in, password reset, email verification, AND session validation.
 * The frontend calls this via createAuthClient({ baseURL }).
 */
export function createBetterAuthInstance(prisma: PrismaClient) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    secret: process.env.BETTER_AUTH_SECRET,

    trustedOrigins: [
      'http://localhost:3001',
      process.env.FRONTEND_URL || 'http://localhost:3001',
    ],

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // flip to true when SMTP is wired
      autoSignIn: true,
    },

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

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path === '/sign-up/email' ||
          ctx.path === '/reset-password'
        ) {
          const password = (ctx.body?.password ?? ctx.body?.newPassword) as
            | string
            | undefined;
          if (password) {
            const { breached } = await checkHIBP(password);
            if (breached) {
              throw new APIError('BAD_REQUEST', {
                message:
                  'This password has appeared in data breaches and cannot be used',
              });
            }
          }
        }
      }),
    },
  });
}
