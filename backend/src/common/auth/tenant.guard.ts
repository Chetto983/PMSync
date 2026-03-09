import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../prisma/tenant-scoping/tenant-context';

/**
 * Tenant Guard: Ensures tenant is properly identified and user has access.
 *
 * Phase 52: Verified compatible with BetterAuthGuard -- reads request.user.tenantId,
 * request.user.userId, and request.user.role, all of which BetterAuthGuard sets
 * in the same shape as the former JWT payload. No code changes required.
 *
 * BullMQ tenantId propagation is also unaffected: controllers pass
 * req.user.tenantId to services, which embed it in job.data -- same shape.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const user = request.user;
    if (!user) {
      this.logger.warn(`TenantGuard: missing user on request for path=${request.path}`);
      throw new UnauthorizedException('User context missing from request.');
    }

    const headerTenantRaw = request.headers['x-tenant-id'];
    const headerTenantId = Array.isArray(headerTenantRaw)
      ? headerTenantRaw[0]
      : headerTenantRaw;

    const providedTenantIdentifier = headerTenantId || user.tenantId;

    if (!providedTenantIdentifier) {
      this.logger.warn(
        `TenantGuard: no tenant id provided (header or token) for user=${user.userId} path=${request.path}`,
      );
      throw new BadRequestException('Tenant ID not found in request');
    }

    // Look up tenant by id or slug
    // Guard runs before CorrelationInterceptor — no AsyncLocalStorage context yet
    const tenant = await withoutTenantScopingAsync(() =>
      this.prisma.tenant.findFirst({
        where: {
          OR: [
            { id: providedTenantIdentifier },
            { slug: providedTenantIdentifier },
          ],
        },
      }),
    );

    if (!tenant) {
      this.logger.warn(
        `TenantGuard: tenant not found for identifier=${providedTenantIdentifier} user=${user.userId}`,
      );
      throw new ForbiddenException('Invalid or inactive tenant');
    }

    if (!tenant.isActive) {
      this.logger.warn(
        `TenantGuard: tenant inactive identifier=${providedTenantIdentifier} user=${user.userId}`,
      );
      throw new ForbiddenException('Invalid or inactive tenant');
    }

    const resolvedTenantId = tenant.id;
    const isCrossTenant = user.tenantId && user.tenantId !== resolvedTenantId;

    if (isCrossTenant && user.role !== 'super-admin') {
      this.logger.warn(
        `TenantGuard: cross-tenant access denied user=${user.userId} tokenTenant=${user.tenantId} targetTenant=${resolvedTenantId}`,
      );
      throw new ForbiddenException('Cross-tenant access requires super-admin privileges.');
    }

    // Attach tenant to request
    request.tenant = tenant;
    request.activeTenantId = resolvedTenantId;
    request.user = {
      ...user,
      originalTenantId: user.originalTenantId ?? user.tenantId,
      tenantId: resolvedTenantId,
    };

    return true;
  }
}
