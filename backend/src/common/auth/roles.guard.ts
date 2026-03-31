import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * Role-Based Access Control Guard
 *
 * Enforces role requirements on endpoints using @Roles() decorator.
 * Prevents unauthorized access to admin/super-admin endpoints.
 *
 * Phase 52: Verified compatible with BetterAuthGuard -- reads request.user.role
 * which BetterAuthGuard sets from the session.
 *
 * Usage:
 * @UseGuards(TenantGuard, RolesGuard)
 * @Roles('super-admin', 'admin')
 * async someEndpoint() { ... }
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);
  private static readonly SUPER_ADMIN_ROLE = 'super-admin';

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from @Roles() decorator
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Get user from request (set by BetterAuthGuard, global)
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.warn('RolesGuard: No user context found in request');
      throw new ForbiddenException('User context missing from request');
    }

    if (!user.role) {
      this.logger.warn(`RolesGuard: User ${user.userId} has no role assigned`);
      throw new ForbiddenException('User has no role assigned');
    }

    // super-admin is the only hierarchical role in the current RBAC model.
    // It must satisfy legacy @Roles('admin') and @Roles('admin', 'manager') decorators.
    const hasRole =
      user.role === RolesGuard.SUPER_ADMIN_ROLE ||
      requiredRoles.includes(user.role);

    if (!hasRole) {
      this.logger.warn(
        `RolesGuard: Access denied for user ${user.userId} (role: ${user.role}, required: ${requiredRoles.join(', ')})`,
      );
      throw new ForbiddenException(
        `Access denied. Required role: ${requiredRoles.join(' or ')}`,
      );
    }

    this.logger.debug(
      `RolesGuard: Access granted for user ${user.userId} (role: ${user.role})`,
    );

    return true;
  }
}
