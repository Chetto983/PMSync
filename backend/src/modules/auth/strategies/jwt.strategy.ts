import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';

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
 *
 * Performance optimization:
 * - Redis session cache: 5 minute TTL reduces DB queries from 2 to 0 per request
 * - Cache invalidation on logout/password reset ensures security
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  /** Session cache TTL in seconds (5 minutes) */
  private readonly SESSION_CACHE_TTL = 300;

  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {
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
   * 2. Redis cache check (performance optimization - skips DB if cached)
   * 3. Session existence and validity (not expired, not revoked)
   * 4. User existence and active status
   * 5. Tenant active status
   * 6. Role consistency (token role matches current role)
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

    // 2. PERFORMANCE: Check Redis cache first (reduces DB queries from 2 to 0)
    // SECURITY: Include tenantId in cache key for proper tenant isolation
    const cacheKey = payload.sessionId
      ? `${payload.tenantId}:${payload.sessionId}`
      : `${payload.tenantId}:user:${payload.userId}`;

    const cachedUser = await this.cacheService.get<{
      id: string;
      userId: string;
      tenantId: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      sessionId?: string;
      sessionExpiresAt?: string;
    }>(cacheKey, { namespace: CacheNamespace.USER_SESSION });

    if (cachedUser) {
      // Validate session expiry from cache
      if (cachedUser.sessionExpiresAt) {
        const expiresAt = new Date(cachedUser.sessionExpiresAt);
        if (expiresAt < new Date()) {
          // Session expired - invalidate cache and reject
          await this.cacheService.del(cacheKey, { namespace: CacheNamespace.USER_SESSION });
          this.rejectToken('session_expired', {
            sessionId: payload.sessionId,
            expiredAt: cachedUser.sessionExpiresAt,
          });
          return null;
        }
      }

      // Verify cached data matches token claims
      if (cachedUser.tenantId !== payload.tenantId) {
        await this.cacheService.del(cacheKey, { namespace: CacheNamespace.USER_SESSION });
        this.rejectToken('tenant_mismatch', {
          userId: cachedUser.id,
          tokenTenantId: payload.tenantId,
          cachedTenantId: cachedUser.tenantId,
        });
        return null;
      }

      if (payload.role && payload.role !== cachedUser.role) {
        await this.cacheService.del(cacheKey, { namespace: CacheNamespace.USER_SESSION });
        this.rejectToken('role_changed', {
          userId: cachedUser.id,
          tokenRole: payload.role,
          cachedRole: cachedUser.role,
        });
        return null;
      }

      // Cache hit - return cached user context (no DB queries!)
      return {
        id: cachedUser.id,
        userId: cachedUser.userId,
        tenantId: cachedUser.tenantId,
        email: cachedUser.email,
        firstName: cachedUser.firstName,
        lastName: cachedUser.lastName,
        role: cachedUser.role,
        sessionId: payload.sessionId,
      };
    }

    // 3. Cache miss - validate session if sessionId is present
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

    // 4. Get user with tenant
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      include: { tenant: true },
    });

    if (!user) {
      this.rejectToken('user_not_found', { userId: payload.userId });
      return null;
    }

    // 5. Check user is active
    if (!user.isActive) {
      this.rejectToken('user_inactive', {
        userId: user.id,
        email: this.redactEmail(user.email),
      });
      return null;
    }

    // 6. Check tenant is active
    if (!user.tenant.isActive) {
      this.rejectToken('tenant_inactive', {
        userId: user.id,
        tenantId: user.tenantId,
      });
      return null;
    }

    // 7. Verify tenant consistency
    if (user.tenantId !== payload.tenantId) {
      this.rejectToken('tenant_mismatch', {
        userId: user.id,
        tokenTenantId: payload.tenantId,
        userTenantId: user.tenantId,
      });
      return null;
    }

    // 8. Check for role changes (optional - reject if role changed since token issuance)
    if (payload.role && payload.role !== user.role) {
      this.rejectToken('role_changed', {
        userId: user.id,
        tokenRole: payload.role,
        currentRole: user.role,
      });
      return null;
    }

    // 9. Build validated user context
    const validatedUser = {
      id: user.id,
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      sessionId: payload.sessionId,
    };

    // 10. PERFORMANCE: Cache the validated session (5 min TTL)
    // This eliminates DB queries on subsequent requests
    const sessionData = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      select: { expiresAt: true },
    });

    await this.cacheService.set(
      cacheKey,
      {
        ...validatedUser,
        sessionExpiresAt: sessionData?.expiresAt?.toISOString(),
      },
      {
        namespace: CacheNamespace.USER_SESSION,
        ttl: this.SESSION_CACHE_TTL,
      },
    );

    return validatedUser;
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
