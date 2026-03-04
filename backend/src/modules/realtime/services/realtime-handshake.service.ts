import { ConfigService } from '@nestjs/config';
import { Injectable, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedSocket, buildTenantRoom } from '../types/realtime.types';
import { AUTH_COOKIE_NAME } from '../../auth/helpers/cookie.helper';

interface HandshakeResult {
  userId: string;
  tenantId: string;
  email: string;
  tenantRoom: string;
}

/**
 * RealtimeHandshakeService - Secure WebSocket authentication
 *
 * Security features:
 * - JWT validation with consistent secret (no fallback)
 * - User active status check (rejects disabled users)
 * - Tenant active status check (rejects inactive tenants)
 * - Tenant match verification (token tenantId must match user tenantId)
 * - PII-redacted structured logging
 *
 * @see REALTIME_MODULE_ROADMAP.md Phase 1 - Auth & Contract Hardening
 */
@Injectable()
export class RealtimeHandshakeService {
  private readonly logger = new Logger(RealtimeHandshakeService.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Get JWT secret - must be consistent with realtime.module.ts
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret || secret.length < 32) {
      this.logger.error('JWT_SECRET not configured or too short for WebSocket handshake');
      throw new Error('JWT_SECRET is required for WebSocket handshake');
    }
    this.jwtSecret = secret;
  }

  /**
   * Redact email for logging (keep first 2 chars + domain)
   */
  private redactEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***@***';
    return `${local.substring(0, 2)}***@${domain}`;
  }

  extractToken(client: AuthenticatedSocket): string | null {
    // SEC-01: Check httpOnly cookie first (set by auth.controller on login)
    const cookieHeader = client.handshake.headers?.cookie;
    if (cookieHeader) {
      const cookieToken = this.parseCookieValue(cookieHeader, AUTH_COOKIE_NAME);
      if (cookieToken) {
        return cookieToken;
      }
    }

    // Fallback: Bearer header or auth.token (dual-mode transition)
    const headerToken =
      client.handshake.headers?.authorization?.replace(/Bearer\s+/i, '') ||
      client.handshake.auth?.token;

    if (headerToken) {
      return headerToken;
    }

    // Fallback: query.token
    const queryToken = client.handshake.query?.token;
    if (!queryToken) {
      return null;
    }

    return Array.isArray(queryToken) ? queryToken[0] : String(queryToken);
  }

  /**
   * Parse a specific cookie value from a raw cookie header string.
   * Simple split-based parser -- no library needed for JWT values (no special chars).
   */
  private parseCookieValue(cookieHeader: string, name: string): string | null {
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const trimmed = cookie.trim();
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      if (key === name) {
        return value || null;
      }
    }
    return null;
  }

  private async validateToken(token: string): Promise<any> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.jwtSecret,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        JSON.stringify({
          event: 'ws_token_validation_failed',
          error: message,
        }),
      );
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Authenticate WebSocket connection
   *
   * Security checks performed:
   * 1. Token presence and JWT signature validation
   * 2. Token payload validation (userId, tenantId required)
   * 3. User existence and tenant match
   * 4. User active status (rejects disabled users)
   * 5. Tenant active status (rejects inactive tenants)
   */
  async authenticate(client: AuthenticatedSocket): Promise<HandshakeResult> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(
        JSON.stringify({
          event: 'ws_auth_missing_token',
          clientId: client.id,
        }),
      );
      throw new UnauthorizedException('Missing token');
    }

    const decoded = await this.validateToken(token);
    if (!decoded?.userId || !decoded?.tenantId) {
      this.logger.warn(
        JSON.stringify({
          event: 'ws_auth_invalid_payload',
          hasUserId: !!decoded?.userId,
          hasTenantId: !!decoded?.tenantId,
        }),
      );
      throw new UnauthorizedException('Invalid token payload');
    }

    // Fetch user with tenant to check active status
    const user = await this.prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        tenantId: true,
        isActive: true,
        tenant: {
          select: { isActive: true },
        },
      },
    });

    if (!user) {
      this.logger.warn(
        JSON.stringify({
          event: 'ws_auth_user_not_found',
          userId: decoded.userId,
        }),
      );
      throw new UnauthorizedException('User not found');
    }

    // Check tenant match
    if (user.tenantId !== decoded.tenantId) {
      this.logger.warn(
        JSON.stringify({
          event: 'ws_auth_tenant_mismatch',
          userId: user.id,
          tokenTenantId: decoded.tenantId,
          userTenantId: user.tenantId,
        }),
      );
      throw new UnauthorizedException('Tenant mismatch');
    }

    // SECURITY: Check user is active
    if (!user.isActive) {
      this.logger.warn(
        JSON.stringify({
          event: 'ws_auth_user_inactive',
          userId: user.id,
          email: this.redactEmail(user.email),
        }),
      );
      throw new ForbiddenException('Account is disabled');
    }

    // SECURITY: Check tenant is active
    if (!user.tenant.isActive) {
      this.logger.warn(
        JSON.stringify({
          event: 'ws_auth_tenant_inactive',
          userId: user.id,
          tenantId: user.tenantId,
        }),
      );
      throw new ForbiddenException('Organization is disabled');
    }

    this.logger.log(
      JSON.stringify({
        event: 'ws_auth_success',
        userId: user.id,
        email: this.redactEmail(user.email),
        tenantId: user.tenantId,
      }),
    );

    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      tenantRoom: buildTenantRoom(user.tenantId),
    };
  }
}
