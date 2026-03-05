import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
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
    const tokenHash = this.hashRefreshToken(rawToken);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } },
    });

    if (!existing) throw new UnauthorizedException('Invalid refresh token');
    if (existing.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');

    if (existing.isUsed) {
      const timeSinceCreation = Date.now() - existing.createdAt.getTime();
      if (timeSinceCreation <= this.REFRESH_GRACE_PERIOD_MS && existing.replacedBy) {
        const replacement = await this.prisma.refreshToken.findUnique({
          where: { tokenHash: existing.replacedBy },
        });
        if (replacement) {
          const accessToken = this.jwtService.sign({
            sessionId: nanoid(), userId: existing.userId, tenantId: existing.tenantId,
            email: existing.user.email, role: existing.user.role,
          });
          const newRefresh = await this.createRefreshToken(existing.userId, existing.tenantId, existing.familyId);
          return { accessToken, refreshToken: newRefresh.token };
        }
      }

      this.logger.warn(
        JSON.stringify({ event: 'refresh_token_theft_detected', userId: existing.userId, familyId: existing.familyId }),
      );
      await this.prisma.refreshToken.deleteMany({ where: { familyId: existing.familyId } });
      throw new UnauthorizedException('Token reuse detected');
    }

    const newRefresh = await this.createRefreshToken(existing.userId, existing.tenantId, existing.familyId);
    const newTokenHash = this.hashRefreshToken(newRefresh.token);

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { isUsed: true, replacedBy: newTokenHash },
    });

    const accessToken = this.jwtService.sign({
      sessionId: nanoid(), userId: existing.userId, tenantId: existing.tenantId,
      email: existing.user.email, role: existing.user.role,
    });

    return { accessToken, refreshToken: newRefresh.token };
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
      where: { userId },
      select: { id: true },
    });

    await Promise.all(
      sessionsToInvalidate.map((s) =>
        this.cacheService.del(`${tenantId}:${s.id}`, { namespace: CacheNamespace.USER_SESSION }),
      ),
    );
    await this.cacheService.del(`${tenantId}:user:${userId}`, { namespace: CacheNamespace.USER_SESSION });

    const deletedSessions = await this.prisma.session.deleteMany({ where: { userId } });

    return { sessionCount: deletedSessions.count, cacheCount: sessionsToInvalidate.length + 1 };
  }
}
