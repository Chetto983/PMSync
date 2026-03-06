import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for roles
 */
export const ROLES_KEY = 'roles';

/**
 * Roles Decorator
 *
 * Specifies which roles are allowed to access an endpoint
 * Must be used with RolesGuard
 *
 * @param roles - Array of role names (e.g., 'admin', 'super-admin', 'user')
 *
 * @example
 * @UseGuards(TenantGuard, RolesGuard)
 * @Roles('super-admin')
 * async deleteAllData() { ... }
 *
 * @example
 * @UseGuards(TenantGuard, RolesGuard)
 * @Roles('admin', 'super-admin')  // Either role allowed
 * async viewAnalytics() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
