import type { PrismaClient, Prisma } from '@prisma/client';
import { withoutTenantScopingAsync } from '../../prisma/tenant-scoping/tenant-context';
import { getRequestIp } from '../utils/request.utils';

/**
 * Maps better-auth internal paths to audit event type strings.
 * Exact matches are checked first, then wildcard suffix, then callback prefix.
 */
const AUDIT_PATHS: Record<string, string> = {
  '/sign-up/email': 'AUTH:SIGNUP',
  '/sign-in/email': 'AUTH:LOGIN',
  '/sign-out': 'AUTH:LOGOUT',
  '/reset-password': 'AUTH:PASSWORD_RESET',
  '/change-password': 'AUTH:PASSWORD_CHANGE',
  '/verify-email': 'AUTH:EMAIL_VERIFIED',
  '/two-factor/enable': 'AUTH:2FA_ENABLE',
  '/two-factor/disable': 'AUTH:2FA_DISABLE',
  '/passkey/register': 'AUTH:PASSKEY_REGISTER',
  '/admin/ban-user': 'AUTH:ADMIN_BAN',
  '/admin/unban-user': 'AUTH:ADMIN_UNBAN',
  '/admin/impersonate-user': 'AUTH:ADMIN_IMPERSONATE',
  '/admin/stop-impersonating': 'AUTH:ADMIN_STOP_IMPERSONATE',
  '/admin/revoke-user-sessions': 'AUTH:ADMIN_REVOKE_SESSIONS',
  '/admin/revoke-user-session': 'AUTH:ADMIN_REVOKE_SESSION',
};

/** Wildcard suffix patterns (path starts with key minus trailing /*) */
const AUDIT_WILDCARD_PATHS: Array<{ prefix: string; event: string }> = [
  { prefix: '/passkey/delete/', event: 'AUTH:PASSKEY_REMOVE' },
];

/** Social login callback prefix */
const SOCIAL_CALLBACK_PREFIX = '/callback/';
const SOCIAL_LOGIN_EVENT = 'AUTH:SOCIAL_LOGIN';

export function resolveEventType(path: string): string | null {
  // 1. Exact match
  if (AUDIT_PATHS[path]) {
    return AUDIT_PATHS[path];
  }

  // 2. Wildcard suffix match
  for (const { prefix, event } of AUDIT_WILDCARD_PATHS) {
    if (path.startsWith(prefix)) {
      return event;
    }
  }

  // 3. Social callback prefix
  if (path.startsWith(SOCIAL_CALLBACK_PREFIX)) {
    return SOCIAL_LOGIN_EVENT;
  }

  return null;
}

/**
 * Fire-and-forget audit logging for better-auth lifecycle events.
 *
 * Catches all errors silently to never block auth responses.
 * Requires a tenantId -- events without tenant context (e.g. pre-provisioning
 * signup) are skipped; signup audit is handled separately after provisioning.
 */
export async function logAuthEvent(
  prisma: PrismaClient,
  path: string,
  userId: string | null,
  tenantId: string | null,
  request: Request | undefined,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const eventType = resolveEventType(path);
    if (!eventType || !tenantId) {
      return;
    }

    const ipAddress = getRequestIp(request) ?? null;

    await withoutTenantScopingAsync(() =>
      prisma.auditLog.create({
        data: {
          tenantId,
          userId: userId ?? undefined,
          action: eventType,
          entity: 'BetterAuth',
          entityId: userId ?? 'unknown',
          changes: (metadata as Prisma.InputJsonValue) ?? undefined,
          ipAddress,
        },
      }),
    );
  } catch {
    // Fire-and-forget: swallow all errors
  }
}
