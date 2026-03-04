/**
 * Tenant Context for Prisma Extension
 *
 * Reads tenantId from AsyncLocalStorage (populated by CorrelationInterceptor).
 * Provides bypass mechanism for system-level operations.
 */
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Bypass storage — when set to true, tenant scoping is skipped.
 * Used for system operations (migrations, seeds, cron jobs without user context).
 */
const bypassStorage = new AsyncLocalStorage<boolean>();

/**
 * Get tenantId from the CorrelationContext AsyncLocalStorage.
 * Returns undefined if no context is active.
 *
 * NOTE: This imports the same AsyncLocalStorage instance used by
 * CorrelationContextService via the static CorrelationContext object.
 */
export function getTenantIdFromContext(): string | undefined {
  // Import dynamically to avoid circular dependency with CorrelationContextService
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CorrelationContext } = require('../../common/services/correlation-context.service');
  return CorrelationContext.getContext()?.tenantId;
}

/**
 * Check if tenant scoping is currently bypassed.
 */
export function isTenantScopingBypassed(): boolean {
  return bypassStorage.getStore() === true;
}

/**
 * Run a callback without tenant scoping.
 * Use for system-level operations that legitimately need cross-tenant access:
 * - Database migrations/seeds
 * - Cron jobs operating on all tenants
 * - Admin operations
 *
 * @example
 * const allUsers = await withoutTenantScoping(() =>
 *   prisma.user.findMany()
 * );
 */
export function withoutTenantScoping<T>(fn: () => T): T {
  return bypassStorage.run(true, fn);
}

/**
 * Async version of withoutTenantScoping.
 */
export async function withoutTenantScopingAsync<T>(
  fn: () => Promise<T>,
): Promise<T> {
  return bypassStorage.run(true, fn);
}
