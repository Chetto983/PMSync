import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';
import { AuthConfigService } from './auth-config.service';
import { nanoid } from 'nanoid';

/**
 * Handles logout, refresh token rotation, and user profile.
 * Extracted from AuthService for maintainability.
 */
@Injectable()
export class AuthTokenService {
  private readonly logger = new Logger(AuthTokenService.name);
  /** Grace period for token reuse (10 seconds) to handle network retries */
  private readonly REFRESH_GRACE_PERIOD_MS = 10_000;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private cacheService: CacheService,
    private authConfigService: AuthConfigService,
  ) {}

  /**
   * Hash a refresh token using HMAC-SHA256 with the dedicated refresh secret
   */
  private hashRefreshToken(token: string): string {
    return crypto
      .createHmac('sha256', this.authConfigService.refreshTokenSecret)
      .update(token)
      .digest('hex');
  }

  /**
   * Logout user -- invalidate session cache and delete session
   */
  async logout(sessionId?: string | null, tenantId?: string | null, userId?: string | null) {
    if (!sessionId) {
      this.logger.warn('Logout called without a valid sessionId');
      return;
    }

    if (tenantId) {
      await this.cacheService.del(`${tenantId}:${sessionId}`, { namespace: CacheNamespace.USER_SESSION });
      if (userId) {
        await this.cacheService.del(`${tenantId}:user:${userId}`, { namespace: CacheNamespace.USER_SESSION });
      }
    } else {
      await this.cacheService.del(sessionId, { namespace: CacheNamespace.USER_SESSION });
    }

    await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => {});

    this.logger.log(`User logged out: ${sessionId}`);
  }

  /**
   * Create a new refresh token for a user (AUTH-02)
   */
  async createRefreshToken(
    userId: string,
    tenantId: string,
    familyId?: string,
  ): Promise<{ token: string; familyId: string }> {
    const rawToken = nanoid(64);
    const tokenHash = this.hashRefreshToken(rawToken);
    const family = familyId || nanoid(32);

    await this.prisma.refreshToken.create({
      data: {
        tenantId, userId, familyId: family, tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { token: rawToken, familyId: family };
  }

  /**
   * Rotate a refresh token (AUTH-02, AUTH-03)
   */
  async rotateRefreshToken(rawToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    return withoutTenantScopingAsync(() => this._rotateRefreshToken(rawToken));
  }

  private async _rotateRefreshToken(rawToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.hashRefreshToken(rawToken);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            tenant: { select: { isActive: true } },
          },
        },
      },
    });

    if (!existing) throw new UnauthorizedException('Invalid refresh token');
    if (existing.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');
    if (!existing.user.isActive) throw new UnauthorizedException('Account disabled');
    if (!existing.user.tenant.isActive) throw new UnauthorizedException('Organization disabled');

    if (existing.isUsed) {
      // Grace period: tolerate a single reuse within a short window for network retries.
      // Determine grace window from replacement token creation time (not original token creation).
      // Using original createdAt would falsely trigger "theft" for normal long-lived tokens.
      this.logger.warn(
        JSON.stringify({ event: 'refresh_token_reuse', userId: existing.userId, familyId: existing.familyId }),
      );

      let isWithinGrace = false;
      if (existing.replacedBy) {
        const replacement = await this.prisma.refreshToken.findUnique({
          where: { tokenHash: existing.replacedBy },
          select: { createdAt: true },
        });
        if (replacement) {
          const ageMs = Date.now() - replacement.createdAt.getTime();
          isWithinGrace = ageMs <= this.REFRESH_GRACE_PERIOD_MS;
        }
      }

      if (!isWithinGrace) {
        // Outside grace period — treat as theft
        this.logger.warn(
          JSON.stringify({ event: 'refresh_token_theft_detected', userId: existing.userId, familyId: existing.familyId }),
        );
        await this.prisma.refreshToken.deleteMany({ where: { familyId: existing.familyId } });
      }

      throw new UnauthorizedException('Token already rotated');
    }

    const newRawRefreshToken = nanoid(64);
    const newRefreshTokenHash = this.hashRefreshToken(newRawRefreshToken);
    const newSessionId = nanoid();
    const accessToken = this.jwtService.sign({
      type: 'access',
      sessionId: newSessionId,
      userId: existing.userId,
      tenantId: existing.tenantId,
      role: existing.user.role,
    });

    await this.prisma.$transaction(async (tx) => {
      // Atomic "mark used" gate closes refresh-race windows.
      const markUsed = await tx.refreshToken.updateMany({
        where: { id: existing.id, isUsed: false },
        data: { isUsed: true, replacedBy: newRefreshTokenHash },
      });
      if (markUsed.count !== 1) {
        throw new UnauthorizedException('Token already rotated');
      }

      await tx.refreshToken.create({
        data: {
          tenantId: existing.tenantId,
          userId: existing.userId,
          familyId: existing.familyId,
          tokenHash: newRefreshTokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Enforce session concurrency limit on refresh-issued sessions too.
      const existingSessions = await tx.session.findMany({
        where: {
          userId: existing.userId,
          tenantId: existing.tenantId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (existingSessions.length >= this.authConfigService.maxSessionsPerUser) {
        const sessionsToDelete = existingSessions.slice(
          0,
          existingSessions.length - this.authConfigService.maxSessionsPerUser + 1,
        );
        await tx.session.deleteMany({
          where: { id: { in: sessionsToDelete.map((s) => s.id) } },
        });
      }

      await tx.session.create({
        data: {
          id: newSessionId,
          tenantId: existing.tenantId,
          userId: existing.userId,
          token: accessToken,
          expiresAt: new Date(Date.now() + this.authConfigService.sessionTtlMs),
          ipAddress: 'token-refresh',
          userAgent: 'token-refresh',
        },
      });
    });

    return { accessToken, refreshToken: newRawRefreshToken };
  }

  /**
   * Delete all refresh tokens for a user (AUTH-05)
   */
  async deleteAllRefreshTokens(userId: string, tenantId: string): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({ where: { userId, tenantId } });
    this.logger.log(JSON.stringify({ event: 'refresh_tokens_deleted', userId, count: result.count }));
    return result.count;
  }

  /**
   * Get current user profile
   */
  async getCurrentUserProfile(userId: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        avatarUrl: true, role: true, isMfaEnabled: true, lastLogin: true, createdAt: true,
      },
    });

    if (!user) throw new UnauthorizedException('User not found');
    return { ...user, tenantId };
  }

  /**
   * Invalidate all sessions for a user (used by password reset)
   */
  async invalidateAllSessions(userId: string, tenantId: string): Promise<{ sessionCount: number; cacheCount: number }> {
    const sessionsToInvalidate = await this.prisma.session.findMany({
      where: { userId, tenantId },
      select: { id: true },
    });

    await Promise.all(
      sessionsToInvalidate.map((s) =>
        this.cacheService.del(`${tenantId}:${s.id}`, { namespace: CacheNamespace.USER_SESSION }),
      ),
    );
    await this.cacheService.del(`${tenantId}:user:${userId}`, { namespace: CacheNamespace.USER_SESSION });

    const deletedSessions = await this.prisma.session.deleteMany({
      where: { userId, tenantId },
    });

    return { sessionCount: deletedSessions.count, cacheCount: sessionsToInvalidate.length + 1 };
  }
}
