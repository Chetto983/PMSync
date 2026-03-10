import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Guard that restricts org management operations to super-admin users.
 * Enforces ORG-05: API endpoints enforce organization-level permissions.
 *
 * Apply to any NestJS route that performs org management operations.
 * For better-auth routes (proxied via /api/auth/*), enforcement is done
 * via better-auth hooks in better-auth.instance.ts.
 */
@Injectable()
export class OrgManagementGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.role !== 'super-admin') {
      throw new ForbiddenException(
        'Only super-admins can manage organizations',
      );
    }

    return true;
  }
}
