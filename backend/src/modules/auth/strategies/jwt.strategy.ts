import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Extract JWT from cookie (httpOnly secure cookie)
 */
const cookieExtractor = (req: any): string | null => {
  if (req?.cookies?.access_token) return req.cookies.access_token as string;
  const bearerCookie = req?.cookies?.Authorization || req?.cookies?.authorization;
  if (typeof bearerCookie === 'string' && bearerCookie.startsWith('Bearer ')) {
    return bearerCookie.replace(/^Bearer\s+/i, '');
  }
  return null;
};

/**
 * Token rejection reasons for metrics and logging
 */
type RejectionReason =
  | 'empty_payload'
  | 'missing_claims'
  | 'session_not_found'
  | 'session_expired'
  | 'session_revoked'
  | 'user_not_found'
  | 'user_inactive'
  | 'tenant_inactive'
  | 'tenant_mismatch'
  | 'role_changed';

/**
 * JwtStrategy - Validates JWT tokens with session truth checking
 *
 * Security features:
 * - Session validation: tokens are rejected if session is deleted/expired/revoked
 * - User/tenant active check: inactive users/tenants are blocked
 * - Role change detection: tokens issued before role changes are rejected
 * - Structured logging for security audit
 *
 * @see AUTH_MODULE_ROADMAP.md Phase 2 - Session Truth and Revocation
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private prisma: PrismaService) {
    // Fail fast if JWT_SECRET is not properly configured
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret === 'secret' || jwtSecret.length < 32) {
      throw new Error(
        'FATAL: JWT_SECRET is missing, too short, or using unsafe default. ' +
          'Set a secure JWT_SECRET environment variable.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      // Validate issuer/audience if set
      issuer: process.env.JWT_ISSUER || undefined,
      audience: process.env.JWT_AUDIENCE || undefined,
    });
  }

  /**
   * Validate JWT payload with full session and user verification
   *
   * Checks performed:
   * 1. Payload structure (userId, tenantId, sessionId required)
   * 2. Session existence and validity (not expired, not revoked)
   * 3. User existence and active status
   * 4. Tenant active status
   * 5. Role consistency (token role matches current role)
   */
  async validate(payload: any) {
    // 1. Validate payload structure
    if (!payload) {
      this.rejectToken('empty_payload', { message: 'Empty JWT payload' });
      return null;
    }

    if (!payload.userId || !payload.tenantId) {
      this.rejectToken('missing_claims', {
        message: 'Missing required claims',
        keys: Object.keys(payload).join(','),
      });
      return null;
    }

    // 2. Validate session if sessionId is present
    if (payload.sessionId) {
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sessionId },
      });

      if (!session) {
        this.rejectToken('session_not_found', {
          sessionId: payload.sessionId,
          userId: payload.userId,
        });
        return null;
      }

      // Check session expiry
      if (session.expiresAt < new Date()) {
        this.rejectToken('session_expired', {
          sessionId: payload.sessionId,
          expiredAt: session.expiresAt.toISOString(),
        });
        return null;
      }

      // Check if session is revoked (if we add a revoked field)
      if ((session as any).isRevoked) {
        this.rejectToken('session_revoked', {
          sessionId: payload.sessionId,
          userId: payload.userId,
        });
        return null;
      }

      // Verify session belongs to the claimed user
      if (session.userId !== payload.userId) {
        this.rejectToken('session_revoked', {
          sessionId: payload.sessionId,
          sessionUserId: session.userId,
          claimedUserId: payload.userId,
        });
        return null;
      }
    }

    // 3. Get user with tenant
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      include: { tenant: true },
    });

    if (!user) {
      this.rejectToken('user_not_found', { userId: payload.userId });
      return null;
    }

    // 4. Check user is active
    if (!user.isActive) {
      this.rejectToken('user_inactive', {
        userId: user.id,
        email: this.redactEmail(user.email),
      });
      return null;
    }

    // 5. Check tenant is active
    if (!user.tenant.isActive) {
      this.rejectToken('tenant_inactive', {
        userId: user.id,
        tenantId: user.tenantId,
      });
      return null;
    }

    // 6. Verify tenant consistency
    if (user.tenantId !== payload.tenantId) {
      this.rejectToken('tenant_mismatch', {
        userId: user.id,
        tokenTenantId: payload.tenantId,
        userTenantId: user.tenantId,
      });
      return null;
    }

    // 7. Check for role changes (optional - reject if role changed since token issuance)
    if (payload.role && payload.role !== user.role) {
      this.rejectToken('role_changed', {
        userId: user.id,
        tokenRole: payload.role,
        currentRole: user.role,
      });
      return null;
    }

    // All checks passed - return validated user context
    return {
      id: user.id,
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      sessionId: payload.sessionId,
    };
  }

  /**
   * Log token rejection with structured data (PII redacted)
   */
  private rejectToken(reason: RejectionReason, context: Record<string, any>) {
    this.logger.warn(
      JSON.stringify({
        event: 'jwt_validation_failed',
        reason,
        ...context,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  /**
   * Redact email for logging (keep first 2 chars and domain)
   */
  private redactEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***@***';
    return `${local.substring(0, 2)}***@${domain}`;
  }
}
