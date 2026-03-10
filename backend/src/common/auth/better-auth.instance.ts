import { createHash, randomBytes } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { twoFactor, organization } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { CURRENT_PP_VERSION, CURRENT_TOS_VERSION } from '../../modules/compliance/legal.constants';
import { EmailService } from '../../modules/email/services/email.service';
import { withoutTenantScopingAsync } from '../../prisma/tenant-scoping/tenant-context';
import { logAuthEvent } from './audit-hooks';

export interface ProvisioningUser {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  tenantId?: string | null;
}

function sanitizeWorkspaceSlugPart(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  return normalized || 'workspace';
}

function buildWorkspaceName(user: ProvisioningUser): string {
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    user.name?.trim() ||
    user.email.split('@')[0];

  return `${displayName}'s Workspace`;
}

function buildWorkspaceSlug(user: ProvisioningUser): string {
  const base =
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    user.name?.trim() ||
    user.email.split('@')[0];

  return `${sanitizeWorkspaceSlugPart(base)}-${randomBytes(3).toString('hex')}`;
}

export async function provisionWorkspaceForUser(
  prisma: PrismaClient,
  user: ProvisioningUser,
  options: {
    agreedToTerms: boolean;
    ipAddress?: string;
    userAgent?: string;
  },
): Promise<void> {
  if (user.tenantId) {
    return;
  }

  await withoutTenantScopingAsync(() =>
    prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: buildWorkspaceName(user),
          slug: buildWorkspaceSlug(user),
          isActive: true,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          tenantId: tenant.id,
          role: 'admin',
          isActive: true,
        },
      });

      // Create Member record for the org plugin (flat role: everyone is admin, ORG-03)
      await tx.member.create({
        data: {
          organizationId: tenant.id,
          userId: user.id,
          role: 'admin',
        },
      });

      await tx.userPreferences.upsert({
        where: { userId: user.id },
        update: { tenantId: tenant.id },
        create: {
          tenantId: tenant.id,
          userId: user.id,
          folderOrders: {},
          sidebarSmartFiltersExpanded: true,
          sidebarLabelsExpanded: true,
          theme: 'light',
          language: 'en',
          timezone: 'UTC',
          emailDensity: 'comfortable',
        },
      });

      if (options.agreedToTerms) {
        await tx.legalAcceptance.createMany({
          data: [
            {
              userId: user.id,
              tenantId: tenant.id,
              documentType: 'TOS',
              documentVersion: CURRENT_TOS_VERSION,
              ipAddress: options.ipAddress ?? null,
              userAgent: options.userAgent ?? null,
            },
            {
              userId: user.id,
              tenantId: tenant.id,
              documentType: 'PRIVACY_POLICY',
              documentVersion: CURRENT_PP_VERSION,
              ipAddress: options.ipAddress ?? null,
              userAgent: options.userAgent ?? null,
            },
          ],
        });
      }
    }),
  );
}

function getRequestHeader(
  request: Request | undefined,
  headerName: string,
): string | undefined {
  return request?.headers.get(headerName) ?? undefined;
}

export function getRequestIp(request: Request | undefined): string | undefined {
  const forwardedFor = getRequestHeader(request, 'x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || undefined;
  }

  return getRequestHeader(request, 'x-real-ip');
}

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

export function createBetterAuthInstance(
  prisma: PrismaClient,
  emailService: EmailService,
) {
  const backendAuthUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  const publicAuthUrl = process.env.BETTER_AUTH_PUBLIC_URL || frontendUrl;
  const trustedOrigins = Array.from(
    new Set(['http://localhost:3001', frontendUrl, publicAuthUrl, backendAuthUrl]),
  );

  return betterAuth({
    appName: 'PMSync',
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    baseURL: publicAuthUrl,
    secret: process.env.BETTER_AUTH_SECRET,

    trustedOrigins,

    advanced: {
      crossSubDomainCookies: {
        enabled: false,
      },
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    },

    socialProviders: {
      google: {
        clientId: process.env.GMAIL_CLIENT_ID!,
        clientSecret: process.env.GMAIL_CLIENT_SECRET!,
        accessType: 'offline',
        prompt: 'select_account consent',
        scope: [
          'email',
          'profile',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/contacts',
        ],
      },
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID!,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
        tenantId: 'common',
        // Microsoft Entra accepts a single prompt value here.
        prompt: 'select_account',
        scope: [
          'https://graph.microsoft.com/Mail.ReadWrite',
          'https://graph.microsoft.com/Mail.Send',
          'https://graph.microsoft.com/Calendars.ReadWrite',
          'https://graph.microsoft.com/Contacts.ReadWrite',
        ],
      },
    },

    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'microsoft'],
      },
    },

    plugins: [
      twoFactor({
        issuer: 'PMSync',
        backupCodeOptions: { amount: 10, length: 8 },
        totpOptions: { digits: 6, period: 30 },
      }),
      passkey({
        rpID: process.env.PASSKEY_RP_ID || 'localhost',
        rpName: 'PMSync',
        origin: publicAuthUrl,
      }),
      organization({
        // Per CONTEXT.md: only super-admin can create orgs
        allowUserToCreateOrganization: async (user) => {
          return (user as any).role === 'super-admin';
        },
        creatorRole: 'admin', // Flat role model: everyone is admin (ORG-03)
        membershipLimit: 100,
        invitationExpiresIn: 48 * 60 * 60, // 48 hours
        sendInvitationEmail: async (data) => {
          const acceptUrl = `${frontendUrl}/dashboard/invitations/accept?id=${data.id}`;
          await emailService.sendEmail(
            data.email,
            `You've been invited to ${data.organization.name} on PMSync`,
            `<html>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2>Organization Invitation</h2>
                <p>You've been invited to join <strong>${data.organization.name}</strong> on PMSync.</p>
                <a href="${acceptUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  Accept Invitation
                </a>
                <p>Or copy and paste this link in your browser: ${acceptUrl}</p>
                <p>This invitation expires in 48 hours.</p>
              </body>
            </html>`,
          );
        },
        schema: {
          organization: {
            modelName: 'Tenant',
            fields: {
              name: 'name',
              slug: 'slug',
              logo: 'description', // Reuse description column for logo URL
            },
          },
        },
      }),
    ],

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await emailService.sendPasswordResetLink(user.email, url);
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await emailService.sendVerificationEmail(user.email, url);
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 300,
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
          input: false,
        },
        isActive: {
          type: 'boolean',
          required: false,
          defaultValue: true,
          input: false,
        },
        twoFactorEnabled: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false,
        },
        onboardingComplete: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },

    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            // Auto-set activeOrganizationId on login to user's first org (Pitfall 4 fix)
            const member = await withoutTenantScopingAsync(() =>
              prisma.member.findFirst({
                where: { userId: session.userId },
                orderBy: { createdAt: 'asc' },
                select: { organizationId: true },
              }),
            );
            if (member) {
              return {
                data: {
                  ...session,
                  activeOrganizationId: member.organizationId,
                },
              };
            }
            return { data: session };
          },
        },
      },
      user: {
        create: {
          after: async (user, context) => {
            const path = context?.path ?? '';
            const isSocialLogin = path.startsWith('/callback/');
            const isEmailSignup = path === '/sign-up/email';

            if (!isEmailSignup && !isSocialLogin) {
              return;
            }

            await provisionWorkspaceForUser(prisma, user, {
              // Social logins accept terms during onboarding, not signup
              agreedToTerms: isEmailSignup && context?.body?.agreeToTerms === true,
              ipAddress: getRequestIp(context?.request),
              userAgent: getRequestHeader(context?.request, 'user-agent'),
            });

            // Audit signup after provisioning (tenantId now available)
            const updatedUser = await withoutTenantScopingAsync(() =>
              prisma.user.findUnique({
                where: { id: user.id },
                select: { tenantId: true },
              }),
            );
            void logAuthEvent(
              prisma,
              path,
              user.id,
              updatedUser?.tenantId ?? null,
              context?.request,
            );
          },
        },
      },
    },

    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const ctxAny = ctx as any;
        const userId =
          ctxAny.session?.userId ?? ctxAny.user?.id ?? null;
        const tenantId =
          ctxAny.session?.user?.tenantId ?? ctxAny.user?.tenantId ?? null;
        void logAuthEvent(prisma, ctx.path, userId, tenantId, ctx.request, {
          userAgent: ctx.request?.headers.get('user-agent') ?? undefined,
        });
      }),
      before: createAuthMiddleware(async (ctx) => {
        // Guard: cap image size to prevent cookie cache overflow (Vercel 494)
        if (ctx.path === '/update-user' && ctx.body?.image) {
          const img = ctx.body.image as string;
          // Max ~50KB base64 — anything larger would overflow cookie headers
          if (img.length > 50_000) {
            throw new APIError('BAD_REQUEST', {
              message: 'Avatar image is too large. Please upload a smaller image (max 256×256px).',
            });
          }
        }
        // ORG-05: Block non-super-admin from org management routes
        const orgMgmtPaths = [
          '/organization/create',
          '/organization/update',
          '/organization/delete',
          '/organization/invite-member',
          '/organization/remove-member',
          '/organization/cancel-invitation',
        ];
        if (orgMgmtPaths.some((p) => ctx.path.includes(p))) {
          const session = await ctx.context.getSession(ctx);
          if (!session?.user) {
            throw new APIError('UNAUTHORIZED', { message: 'Authentication required' });
          }
          if ((session.user as any).role !== 'super-admin') {
            throw new APIError('FORBIDDEN', {
              message: 'Only super-admins can manage organizations',
            });
          }
        }

        if (ctx.path === '/sign-up/email' || ctx.path === '/reset-password') {
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

        if (ctx.path === '/sign-up/email' && ctx.body?.agreeToTerms !== true) {
          throw new APIError('BAD_REQUEST', {
            message: 'You must accept the Terms of Service and Privacy Policy',
          });
        }
      }),
    },
  });
}
