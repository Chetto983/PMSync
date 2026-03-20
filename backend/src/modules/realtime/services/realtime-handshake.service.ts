import { Inject, Injectable, Logger, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { BETTER_AUTH } from '../../../common/auth/better-auth.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import { AuthenticatedSocket, buildTenantRoom } from '../types/realtime.types';
import { RealtimeAuthTokenService } from './realtime-auth-token.service';

interface HandshakeResult {
  userId: string;
  tenantId: string;
  email: string;
  tenantRoom: string;
}

interface BetterAuthSession {
  id: string;
  activeOrganizationId?: string | null;
}

interface BetterAuthUser {
  id: string;
  email: string;
  tenantId?: string | null;
  isActive?: boolean | null;
}

interface BetterAuthSessionResult {
  session: BetterAuthSession;
  user: BetterAuthUser;
}

/**
 * RealtimeHandshakeService - Secure WebSocket authentication
 *
 * Uses Better Auth session validation so websocket connections follow the
 * same cookie-backed session lifecycle as HTTP requests.
 */
@Injectable()
export class RealtimeHandshakeService {
  private readonly logger = new Logger(RealtimeHandshakeService.name);

  constructor(
    @Inject(BETTER_AUTH) private readonly auth: any,
    private readonly prisma: PrismaService,
    private readonly realtimeAuthTokenService: RealtimeAuthTokenService,
  ) {}

  /**
   * Redact email for logging (keep first 2 chars + domain)
   */
  private redactEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***@***';
    return `${local.substring(0, 2)}***@${domain}`;
  }

  private getHandshakeToken(client: AuthenticatedSocket): string | null {
    const token = client.handshake.auth?.token;
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  }

  private buildSessionHeaders(client: AuthenticatedSocket): Record<string, string | string[]> {
    const headers = {
      ...client.handshake.headers,
    } as Record<string, string | string[]>;

    const handshakeToken = this.getHandshakeToken(client);
    if (!headers.authorization && handshakeToken) {
      headers.authorization = `Bearer ${handshakeToken}`;
    }

    return headers;
  }

  private async getSession(
    client: AuthenticatedSocket,
  ): Promise<BetterAuthSessionResult | null> {
    const handshakeToken = this.getHandshakeToken(client);
    if (
      handshakeToken &&
      this.realtimeAuthTokenService.isRealtimeAuthToken(handshakeToken)
    ) {
      try {
        return (await this.realtimeAuthTokenService.verifyToken(
          handshakeToken,
        ));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          JSON.stringify({
            event: 'ws_realtime_token_failed',
            error: message,
            clientId: client.id,
          }),
        );
        throw new UnauthorizedException('Invalid or expired session');
      }
    }

    try {
      return await withoutTenantScopingAsync(() =>
        this.auth.api.getSession({
          headers: fromNodeHeaders(this.buildSessionHeaders(client)),
          query: {
            disableCookieCache: true,
          },
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        JSON.stringify({
          event: 'ws_session_lookup_failed',
          error: message,
          clientId: client.id,
        }),
      );
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  /**
   * Authenticate WebSocket connection
   *
   * Security checks performed:
   * 1. Better Auth session validation
   * 2. Tenant assignment presence
   * 3. User active status
   * 4. Tenant active status
   */
  async authenticate(client: AuthenticatedSocket): Promise<HandshakeResult> {
    const result = await this.getSession(client);

    if (!result) {
      this.logger.warn(
        JSON.stringify({
          event: 'ws_auth_missing_session',
          clientId: client.id,
        }),
      );
      throw new UnauthorizedException('Invalid or expired session');
    }

    const { session, user } = result;
    const activeTenantId = session.activeOrganizationId || user.tenantId;

    if (!activeTenantId) {
      this.logger.warn(
        JSON.stringify({
          event: 'ws_auth_missing_tenant',
          userId: user.id,
        }),
      );
      throw new ForbiddenException('User is not assigned to an organization');
    }

    if (user.isActive === false) {
      this.logger.warn(
        JSON.stringify({
          event: 'ws_auth_user_inactive',
          userId: user.id,
          email: this.redactEmail(user.email),
        }),
      );
      throw new ForbiddenException('Account is disabled');
    }

    // WS handshake runs outside HTTP request context — no AsyncLocalStorage tenant
    const persistedUser = await withoutTenantScopingAsync(() =>
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          tenantId: true,
          tenant: {
            select: { isActive: true },
          },
        },
      }),
    );

    if (!persistedUser) {
      this.logger.warn(
        JSON.stringify({
          event: 'ws_auth_user_not_found',
          userId: user.id,
        }),
      );
      throw new UnauthorizedException('User not found');
    }

    if (activeTenantId === persistedUser.tenantId) {
      if (!persistedUser.tenant?.isActive) {
        this.logger.warn(
          JSON.stringify({
            event: 'ws_auth_tenant_inactive',
            userId: user.id,
            tenantId: activeTenantId,
          }),
        );
        throw new ForbiddenException('Organization is disabled');
      }
    } else {
      const membership = await withoutTenantScopingAsync(() =>
        this.prisma.member.findFirst({
          where: {
            userId: user.id,
            organizationId: activeTenantId,
          },
          select: {
            organizationId: true,
            organization: {
              select: { isActive: true },
            },
          },
        }),
      );

      if (!membership) {
        this.logger.warn(
          JSON.stringify({
            event: 'ws_auth_membership_missing',
            userId: user.id,
            sessionTenantId: activeTenantId,
            userTenantId: persistedUser.tenantId,
          }),
        );
        throw new UnauthorizedException('Tenant mismatch');
      }

      if (!membership.organization.isActive) {
        this.logger.warn(
          JSON.stringify({
            event: 'ws_auth_tenant_inactive',
            userId: user.id,
            tenantId: activeTenantId,
          }),
        );
        throw new ForbiddenException('Organization is disabled');
      }
    }

    this.logger.log(
      JSON.stringify({
        event: 'ws_auth_success',
        userId: user.id,
        email: this.redactEmail(user.email),
        tenantId: activeTenantId,
      }),
    );

    return {
      userId: user.id,
      tenantId: activeTenantId,
      email: user.email,
      tenantRoom: buildTenantRoom(activeTenantId),
    };
  }
}
