import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import { PrismaService } from '../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../prisma/tenant-scoping/tenant-context';
import { BETTER_AUTH } from './better-auth.module';
import { IS_PUBLIC_KEY } from './public.decorator';
import { resolveSessionTenantContext } from './session-tenant-resolver';

interface BetterAuthSession {
  id: string;
  activeOrganizationId?: string | null;
}

interface BetterAuthUser {
  id: string;
  email: string;
  tenantId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  isActive?: boolean | null;
}

interface BetterAuthSessionResult {
  session: BetterAuthSession;
  user: BetterAuthUser;
}

/**
 * Global guard that validates better-auth session cookies.
 *
 * Global APP_GUARD backed by DB sessions (no JWT).
 * Registered as APP_GUARD in AppModule.
 *
 * Auth mutation routes (/api/auth/*) are marked @Public() and bypass
 * this guard. Session validation applies to all other routes.
 */
@Injectable()
export class BetterAuthGuard implements CanActivate {
  private readonly logger = new Logger(BetterAuthGuard.name);

  constructor(
    @Inject(BETTER_AUTH) private readonly auth: any,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Validate session via better-auth
    const result = await withoutTenantScopingAsync<BetterAuthSessionResult | null>(() =>
      this.auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
        query: {
          disableCookieCache: true,
        },
      }),
    );

    if (!result) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const { session, user } = result;

    // Check if account is active
    if (user.isActive === false) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const tenantContext = await resolveSessionTenantContext(this.prisma, {
      userId: user.id,
      userTenantId: user.tenantId,
      activeOrganizationId: session.activeOrganizationId,
    });

    if (tenantContext.rejectedActiveOrganizationId) {
      this.logger.warn(
        JSON.stringify({
          event: 'auth_invalid_active_org_fallback',
          userId: user.id,
          sessionId: session.id,
          rejectedActiveOrganizationId: tenantContext.rejectedActiveOrganizationId,
          fallbackTenantId: tenantContext.tenantId,
          reason: tenantContext.fallbackReason,
        }),
      );
    }

    // Map to backward-compatible request.user shape
    // Use a validated activeOrganizationId when present, otherwise fall back to the user's tenant.
    request.user = {
      id: user.id,
      userId: user.id, // backward compat: many services use userId
      tenantId: tenantContext.tenantId,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      role: user.role ?? 'member',
      sessionId: session.id,
    };

    return true;
  }
}
